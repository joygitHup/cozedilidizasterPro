"""Redis：设备最新测值 + 在线状态；故障可观测，读失败回落库"""
from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

ONLINE_TTL = int(getattr(settings, 'IOT_ONLINE_TTL_SECONDS', 180))
LATEST_TTL = int(getattr(settings, 'IOT_LATEST_TTL_SECONDS', 86400))
HEALTH_KEY = 'iot:redis_health'


def _latest_key(device_code: str) -> str:
    return f'iot:latest:{device_code}'


def _online_key(device_code: str) -> str:
    return f'iot:online:{device_code}'


def mark_redis_ok() -> None:
    try:
        cache.set(HEALTH_KEY, {'ok': True}, timeout=120)
    except Exception:  # noqa: BLE001
        pass


def mark_redis_degraded(error: str) -> None:
    logger.warning('Redis degraded: %s', error)
    try:
        # 即使 IGNORE_EXCEPTIONS，也尽量写入；失败则仅打日志
        cache.set(
            HEALTH_KEY,
            {'ok': False, 'error': error[:200]},
            timeout=300,
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        from django.utils import timezone

        items = cache.get('iot:ops_alerts') or []
        if not isinstance(items, list):
            items = []
        alert = {
            'type': 'redis_degraded',
            'message': 'Redis 不可用或读写失败，在线状态/最新值可能与库不一致',
            'error': error[:200],
            'at': timezone.now().isoformat(),
        }
        items = [a for a in items if a.get('type') != 'redis_degraded']
        items.insert(0, alert)
        cache.set('iot:ops_alerts', items[:100], timeout=7 * 24 * 3600)
    except Exception:  # noqa: BLE001
        pass


def redis_health() -> dict[str, Any]:
    try:
        probe = f'iot:ping:{getattr(settings, "REDIS_KEY_PREFIX", "geohazard")}'
        cache.set(probe, 1, timeout=10)
        ok = cache.get(probe) == 1
        if ok:
            mark_redis_ok()
            return {'ok': True, 'ignore_exceptions': bool(getattr(settings, 'REDIS_IGNORE_EXCEPTIONS', True))}
        mark_redis_degraded('ping mismatch')
        return {'ok': False, 'error': 'ping mismatch'}
    except Exception as exc:  # noqa: BLE001
        mark_redis_degraded(str(exc))
        return {'ok': False, 'error': str(exc)}


def set_device_latest(device_code: str, payload: dict[str, Any]) -> bool:
    try:
        cache.set(_latest_key(device_code), payload, timeout=LATEST_TTL)
        mark_redis_ok()
        return True
    except Exception as exc:  # noqa: BLE001
        mark_redis_degraded(str(exc))
        return False


def get_device_latest(device_code: str, *, fallback_db: bool = True) -> dict[str, Any] | None:
    data = None
    try:
        data = cache.get(_latest_key(device_code))
    except Exception as exc:  # noqa: BLE001
        mark_redis_degraded(str(exc))
        data = None

    if data is None and fallback_db:
        data = _latest_from_db(device_code)
        if data is not None:
            data['source'] = 'db_fallback'
            return data
        return None

    if data is None:
        return None
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return None
    if isinstance(data, dict):
        data = dict(data)
        data.setdefault('source', 'redis')
        return data
    return None


def _latest_from_db(device_code: str) -> dict[str, Any] | None:
    try:
        from monitoring.models import MonitorData, MonitoringDevice

        device = MonitoringDevice.objects.filter(code=device_code).first()
        if not device:
            return None
        rows = list(
            MonitorData.objects.filter(device=device)
            .order_by('-record_time')[:8]
        )
        if not rows:
            return None
        primary = rows[0]
        points = [
            {
                'data_type': r.data_type,
                'channel': getattr(r, 'channel', '') or '',
                'value': str(r.value),
                'unit': r.unit,
                'record_time': r.record_time.isoformat(),
            }
            for r in rows
        ]
        return {
            'device_code': device.code,
            'device_type': device.device_type,
            'data_type': primary.data_type,
            'channel': getattr(primary, 'channel', '') or '',
            'value': str(primary.value),
            'unit': primary.unit,
            'record_time': primary.record_time.isoformat(),
            'battery': device.battery,
            'signal': device.signal,
            'points': points,
            'updated_at': primary.record_time.isoformat(),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning('db fallback latest failed: %s', exc)
        return None


def set_device_online(device_code: str, online: bool = True) -> bool:
    try:
        if online:
            cache.set(_online_key(device_code), 1, timeout=ONLINE_TTL)
        else:
            cache.delete(_online_key(device_code))
        return True
    except Exception as exc:  # noqa: BLE001
        mark_redis_degraded(str(exc))
        return False


def get_device_online(device_code: str, *, fallback_db: bool = True) -> bool | None:
    """
    True/False：Redis 明确结果
    None：缓存不可用且无法判断（调用方应展示「未知」而非假离线）
    """
    try:
        val = cache.get(_online_key(device_code))
        if val is not None:
            return bool(val)
    except Exception as exc:  # noqa: BLE001
        mark_redis_degraded(str(exc))
        if not fallback_db:
            return None

    if not fallback_db:
        return False

    try:
        from datetime import timedelta

        from django.utils import timezone
        from monitoring.models import MonitoringDevice

        device = MonitoringDevice.objects.filter(code=device_code).first()
        if not device:
            return False
        # 库内近 TTL 有数据则视为在线近似
        ttl = ONLINE_TTL
        if device.last_data_time and device.last_data_time >= timezone.now() - timedelta(seconds=ttl):
            return True
        return device.status == MonitoringDevice.Status.ONLINE and bool(device.last_data_time)
    except Exception:  # noqa: BLE001
        return None


def touch_device_online(device_code: str) -> None:
    set_device_online(device_code, True)
