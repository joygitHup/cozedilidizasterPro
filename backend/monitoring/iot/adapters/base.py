"""适配器公共工具"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from monitoring.models import MonitoringDevice


@dataclass
class CanonicalPoint:
    data_type: str
    value: Decimal
    unit: str = ''
    channel: str = ''  # GNSS: E/N/U/H；倾角: X/Y；空=标量


def extract_device_code(payload: dict[str, Any], topic: str = '') -> str:
    for key in (
        'device_code',
        'deviceCode',
        'code',
        'devId',
        'dev_id',
        'sn',
        'imei',
        'id',
        'cam',
        'device',
    ):
        raw = payload.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()

    if not topic:
        return ''
    parts = [p for p in topic.strip('/').split('/') if p]
    # geo/telemetry/{code}
    # geo/telemetry/{device_type}/{code}
    if len(parts) >= 4 and parts[0] == 'geo' and parts[1] == 'telemetry':
        return parts[3]
    if len(parts) >= 3 and parts[0] == 'geo' and parts[1] == 'telemetry':
        return parts[2]
    return parts[-1] if parts else ''


def is_canonical(payload: dict[str, Any]) -> bool:
    has_type = bool(payload.get('data_type') or payload.get('dataType'))
    has_value = payload.get('value') is not None
    return has_type and has_value


def parse_value(raw: Any) -> Decimal:
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f'无效数值: {raw}') from exc


def parse_time(raw: Any) -> datetime:
    if raw is None or raw == '':
        return timezone.now()
    if isinstance(raw, datetime):
        return timezone.make_aware(raw) if timezone.is_naive(raw) else raw
    if isinstance(raw, (int, float)):
        ts = float(raw)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.get_current_timezone())
    text = str(raw).strip()
    dt = parse_datetime(text.replace('Z', '+00:00'))
    if dt is None:
        raise ValueError(f'无法解析时间: {raw}')
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def parse_battery(raw: Any) -> int | None:
    if raw is None or raw == '':
        return None
    try:
        return max(0, min(100, int(float(raw))))
    except (TypeError, ValueError):
        return None


def parse_signal(raw: Any) -> str | None:
    if raw is None or raw == '':
        return None
    text = str(raw).strip().lower()
    # rssi 粗映射
    if text.lstrip('-').isdigit() or text.replace('.', '', 1).lstrip('-').isdigit():
        try:
            rssi = float(text)
            if rssi >= -70:
                return MonitoringDevice.Signal.STRONG
            if rssi >= -85:
                return MonitoringDevice.Signal.MEDIUM
            return MonitoringDevice.Signal.WEAK
        except ValueError:
            pass
    mapping = {
        'strong': 'strong',
        'medium': 'medium',
        'weak': 'weak',
        '高': 'strong',
        '中': 'medium',
        '低': 'weak',
        'good': 'strong',
        'ok': 'medium',
        'bad': 'weak',
    }
    return mapping.get(text)


class BaseAdapter:
    device_type: str = ''

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        raise NotImplementedError
