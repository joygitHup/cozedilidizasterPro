"""Celery 任务：入库、离线检测、日聚合"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from celery import shared_task
from django.db.models import Avg, Count, Max, Min
from django.utils import timezone

from monitoring.iot.redis_state import get_device_online, set_device_online
from monitoring.models import MonitorDailyAgg, MonitorData, MonitoringDevice


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def ingest_telemetry_task(
    self, payload: dict, topic: str = '', persist: bool = True, trace_id: str = ''
):
    from monitoring.iot.ingest import process_telemetry_payload
    from monitoring.iot.tracing import bind_trace, log_event

    tid = bind_trace(trace_id or (payload or {}).get('trace_id'))
    log_event('celery.ingest.start', task_id=self.request.id, topic=topic)
    try:
        result = process_telemetry_payload(
            payload, topic=topic, persist=persist, trace_id=tid
        )
        log_event('celery.ingest.ok', task_id=self.request.id)
        if isinstance(result, dict):
            result['trace_id'] = tid
        return result
    except Exception as exc:  # noqa: BLE001
        log_event('celery.ingest.fail', task_id=self.request.id, error=str(exc)[:200])
        raise self.retry(exc=exc)


@shared_task
def mark_offline_devices(offline_after_seconds: int | None = None):
    """
    Redis 无在线标记 + last_data_time 超时 → 标离线。
    Beat 默认每 5 分钟。
    """
    from django.conf import settings

    ttl = offline_after_seconds or int(
        getattr(settings, 'IOT_ONLINE_TTL_SECONDS', 180)
    )
    cutoff = timezone.now() - timedelta(seconds=ttl)
    qs = MonitoringDevice.objects.filter(status=MonitoringDevice.Status.ONLINE)
    marked = 0
    for device in qs.iterator():
        redis_online = get_device_online(device.code)
        # Redis 未知时不误标离线
        if redis_online is None:
            continue
        stale = device.last_data_time is None or device.last_data_time < cutoff
        if not redis_online and stale:
            device.status = MonitoringDevice.Status.OFFLINE
            device.save(update_fields=['status', 'updated_at'])
            set_device_online(device.code, False)
            marked += 1
    return {'marked_offline': marked}


@shared_task
def aggregate_daily(day_str: str | None = None):
    """按设备+类型聚合前一日监测数据。Beat 默认每天 01:10。"""
    from datetime import date, datetime

    if day_str:
        day = date.fromisoformat(day_str)
    else:
        day = (timezone.localdate() - timedelta(days=1))

    start = timezone.make_aware(datetime.combine(day, datetime.min.time()))
    end = start + timedelta(days=1)

    grouped = (
        MonitorData.objects.filter(record_time__gte=start, record_time__lt=end)
        .values('device_id', 'data_type', 'channel')
        .annotate(
            count=Count('id'),
            min_value=Min('value'),
            max_value=Max('value'),
            avg_value=Avg('value'),
        )
    )

    upserted = 0
    for row in grouped:
        avg = row['avg_value']
        MonitorDailyAgg.objects.update_or_create(
            device_id=row['device_id'],
            data_type=row['data_type'],
            channel=row['channel'] or '',
            day=day,
            defaults={
                'count': row['count'],
                'min_value': row['min_value'],
                'max_value': row['max_value'],
                'avg_value': Decimal(str(round(float(avg), 4))) if avg is not None else None,
            },
        )
        upserted += 1
    return {'day': day.isoformat(), 'upserted': upserted}


@shared_task
def evaluate_pending_warnings(limit: int = 200):
    """兜底：对最近未跑过引擎的数据再评估（一般 ingest 已同步触发）"""
    from warning.engines import WarningEngine

    engine = WarningEngine()
    cutoff = timezone.now() - timedelta(hours=1)
    rows = list(
        MonitorData.objects.filter(record_time__gte=cutoff).order_by('-record_time')[:limit]
    )
    triggered = 0
    for data in rows:
        try:
            result = engine.evaluate_from_data(data)
            if result and result.get('triggered'):
                triggered += 1
        except Exception:  # noqa: BLE001
            continue
    return {'scanned': len(rows), 'triggered': triggered}
