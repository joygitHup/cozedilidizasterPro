"""遥测报文处理：适配器归一化 → Redis → 入库/预警"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from monitoring.iot.adapters import expand_to_canonical
from monitoring.iot.redis_state import set_device_latest, touch_device_online
from monitoring.iot.tracing import extract_trace_id, get_trace_id, log_event
from monitoring.models import MonitorData, MonitoringDevice, MqttIngestLog


@transaction.atomic
def persist_telemetry(norm: dict[str, Any]) -> tuple[MonitorData, dict | None]:
    from monitoring import tsdb

    device = MonitoringDevice.objects.select_for_update().get(code=norm['device_code'])
    payload = {
        'device': device,
        'data_type': norm['data_type'],
        'channel': norm.get('channel') or '',
        'value': norm['value'],
        'unit': norm['unit'] or '',
        'record_time': norm['record_time'],
    }
    if tsdb.dual_write_pg():
        data = MonitorData.objects.create(**payload)
    else:
        data = MonitorData(**payload)
        data.id = 0

    if tsdb.external_tsdb_enabled():
        try:
            tsdb.write_monitor_point(
                device_id=device.id,
                device_code=device.code,
                data_type=norm['data_type'],
                value=float(norm['value']),
                unit=norm['unit'] or '',
                channel=norm.get('channel') or '',
                record_time=norm['record_time'],
            )
        except Exception as exc:  # noqa: BLE001
            log_event('django.ingest.tsdb_fail', error=str(exc)[:200])
            if not tsdb.dual_write_pg():
                raise

    updates: dict[str, Any] = {
        'last_data_time': norm['record_time'],
        'status': MonitoringDevice.Status.ONLINE,
        'updated_at': timezone.now(),
    }
    if norm.get('battery') is not None:
        updates['battery'] = max(0, min(100, norm['battery']))
    if norm.get('signal'):
        updates['signal'] = norm['signal']
    MonitoringDevice.objects.filter(pk=device.pk).update(**updates)

    warning_result = None
    try:
        from warning.engines import WarningEngine

        warning_result = WarningEngine().evaluate_from_data(data)
        if warning_result:
            warning_result['trace_id'] = get_trace_id()
    except Exception as exc:  # noqa: BLE001
        warning_result = {'triggered': False, 'error': str(exc), 'trace_id': get_trace_id()}
    return data, warning_result


def _push_adapter_fail_alert(payload: dict, topic: str, error: str) -> None:
    from django.core.cache import cache
    from monitoring.iot.adapters.base import extract_device_code

    code = extract_device_code(payload, topic) or 'unknown'
    alert = {
        'type': 'adapter_or_ingest_fail',
        'device_code': code,
        'topic': topic,
        'trace_id': get_trace_id(),
        'error': error[:300],
        'message': '报文适配/入库失败，监测曲线可能静默断更，请核对厂商字段',
        'at': timezone.now().isoformat(),
        'payload_keys': list(payload.keys()) if isinstance(payload, dict) else [],
    }
    key = 'iot:ops_alerts'
    try:
        items = cache.get(key) or []
        if not isinstance(items, list):
            items = []
        items.insert(0, alert)
        cache.set(key, items[:100], timeout=7 * 24 * 3600)
        cache.set(f'iot:adapter_fail:{code}', alert, timeout=6 * 3600)
        fail_key = f'iot:adapter_fail_count:{code}'
        count = int(cache.get(fail_key) or 0) + 1
        cache.set(fail_key, count, timeout=6 * 3600)
    except Exception:  # noqa: BLE001
        pass


def process_telemetry_payload(
    payload: dict[str, Any],
    *,
    topic: str = '',
    persist: bool = True,
    log: bool = True,
    trace_id: str | None = None,
) -> dict[str, Any]:
    """
    1) 按设备类型适配为标准测点（可多条）
    2) 写 Redis 最新值 + 在线
    3) 可选写库并触发预警
    """
    tid = extract_trace_id(payload=payload if isinstance(payload, dict) else None)
    if trace_id:
        from monitoring.iot.tracing import bind_trace

        tid = bind_trace(trace_id)

    log_event('django.ingest.start', topic=topic, persist=persist)
    log_row = None
    if log:
        from monitoring.iot.adapters.base import extract_device_code

        log_row = MqttIngestLog.objects.create(
            topic=topic[:200],
            device_code=extract_device_code(payload, topic)[:50],
            payload=payload if isinstance(payload, dict) else {},
            status=MqttIngestLog.Status.ACCEPTED,
            trace_id=tid[:64],
        )

    try:
        norms = expand_to_canonical(payload, topic=topic)
        device_code = norms[0]['device_code']
        if log_row:
            log_row.device_code = device_code
            log_row.save(update_fields=['device_code'])

        points_latest = [
            {
                'data_type': n['data_type'],
                'channel': n.get('channel') or '',
                'value': str(n['value']),
                'unit': n['unit'],
                'record_time': n['record_time'].isoformat(),
            }
            for n in norms
        ]
        primary = next((n for n in norms if (n.get('channel') or '') in ('', 'H')), norms[0])
        latest = {
            'device_code': device_code,
            'device_type': primary.get('device_type'),
            'data_type': primary['data_type'],
            'channel': primary.get('channel') or '',
            'value': str(primary['value']),
            'unit': primary['unit'],
            'record_time': primary['record_time'].isoformat(),
            'battery': primary.get('battery'),
            'signal': primary.get('signal'),
            'points': points_latest,
            'trace_id': tid,
            'updated_at': timezone.now().isoformat(),
        }
        set_device_latest(device_code, latest)
        touch_device_online(device_code)

        monitor_data_ids: list[int] = []
        warnings: list[dict] = []
        if persist:
            from django.core.cache import cache

            for norm in norms:
                data, warning_result = persist_telemetry(norm)
                monitor_data_ids.append(data.id)
                if warning_result:
                    warnings.append(warning_result)
            cache.delete(f'iot:adapter_fail_count:{device_code}')
            cache.delete(f'iot:adapter_fail:{device_code}')

        if log_row:
            log_row.status = MqttIngestLog.Status.PROCESSED
            log_row.monitor_data_id = monitor_data_ids[0] if monitor_data_ids else None
            log_row.save(update_fields=['status', 'monitor_data_id'])

        log_event(
            'django.ingest.ok',
            device_code=device_code,
            points=len(points_latest),
            monitor_data_ids=monitor_data_ids,
        )
        return {
            'ok': True,
            'trace_id': tid,
            'device_code': device_code,
            'device_type': primary.get('device_type'),
            'points': points_latest,
            'monitor_data_ids': monitor_data_ids,
            'monitor_data_id': monitor_data_ids[0] if monitor_data_ids else None,
            'latest': latest,
            'persisted': persist,
            'warnings': warnings,
        }
    except Exception as exc:
        if log_row:
            log_row.status = MqttIngestLog.Status.FAILED
            log_row.error = str(exc)[:300]
            log_row.save(update_fields=['status', 'error'])
        log_event('django.ingest.fail', error=str(exc)[:200])
        _push_adapter_fail_alert(payload if isinstance(payload, dict) else {}, topic, str(exc))
        raise


def normalize_telemetry(payload: dict[str, Any], topic: str = '') -> dict[str, Any]:
    norms = expand_to_canonical(payload, topic=topic)
    return norms[0]
