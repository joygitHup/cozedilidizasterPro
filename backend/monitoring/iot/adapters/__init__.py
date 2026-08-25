"""按设备类型把厂商原始报文 → 标准测点列表"""
from __future__ import annotations

from typing import Any

from monitoring.iot.adapters.base import (
    CanonicalPoint,
    extract_device_code,
    is_canonical,
    parse_battery,
    parse_signal,
    parse_time,
    parse_value,
)
from monitoring.iot.adapters.registry import ADAPTERS, get_adapter
from monitoring.models import MonitorData, MonitoringDevice


def expand_to_canonical(
    payload: dict[str, Any],
    *,
    topic: str = '',
    device: MonitoringDevice | None = None,
) -> list[dict[str, Any]]:
    """
    返回标准测点 dict 列表（供 ingest 入库）。
    - 已是标准格式（含 data_type + value）→ 单条直通
    - 否则按台账 device_type 选适配器解析厂商字段
    """
    code = extract_device_code(payload, topic)
    if not code:
        raise ValueError('缺少 device_code（或 Topic 中无法解析）')

    if device is None:
        device = MonitoringDevice.objects.filter(code=code).first()
    if device is None:
        raise ValueError(f'设备不存在: {code}')

    battery = parse_battery(
        payload.get('battery')
        or payload.get('bat')
        or payload.get('batt')
        or payload.get('Battery')
    )
    signal = parse_signal(payload.get('signal') or payload.get('rssi') or payload.get('Signal'))
    record_time = parse_time(
        payload.get('record_time')
        or payload.get('recordTime')
        or payload.get('ts')
        or payload.get('time')
        or payload.get('timestamp')
    )

    points: list[CanonicalPoint]
    if is_canonical(payload):
        data_type = (payload.get('data_type') or payload.get('dataType') or '').strip()
        if data_type not in MonitorData.DataType.values:
            raise ValueError(
                f'无效 data_type: {data_type}，可选: {", ".join(MonitorData.DataType.values)}'
            )
        points = [
            CanonicalPoint(
                data_type=data_type,
                value=parse_value(payload.get('value')),
                unit=(payload.get('unit') or '').strip(),
                channel=str(payload.get('channel') or '').strip().upper(),
            )
        ]
    else:
        adapter = get_adapter(device.device_type)
        points = adapter.parse(payload, device=device)
        if not points:
            raise ValueError(
                f'设备类型 {device.device_type} 未能从报文解析出测点，'
                f'请检查字段或改用标准格式 data_type+value'
            )

    out: list[dict[str, Any]] = []
    for p in points:
        if p.data_type not in MonitorData.DataType.values:
            raise ValueError(f'适配器产出无效 data_type: {p.data_type}')
        out.append(
            {
                'device_code': device.code,
                'device_type': device.device_type,
                'data_type': p.data_type,
                'channel': (p.channel or '').strip().upper(),
                'value': p.value,
                'unit': p.unit,
                'record_time': record_time,
                'battery': battery,
                'signal': signal,
                'topic': topic,
            }
        )
    return out


__all__ = ['ADAPTERS', 'expand_to_canonical', 'get_adapter']
