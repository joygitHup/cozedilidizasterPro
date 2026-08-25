"""设备类型 → 适配器注册表"""
from __future__ import annotations

from typing import Any

from monitoring.iot.adapters.base import BaseAdapter, CanonicalPoint, parse_value
from monitoring.models import MonitoringDevice


class RainfallAdapter(BaseAdapter):
    """雨量计：rain_mm / rain / R / rainfall"""

    device_type = 'rainfall'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        for key in ('rain_mm', 'rain', 'R', 'rainfall', 'precip', 'value_mm'):
            if payload.get(key) is not None:
                return [CanonicalPoint('rainfall', parse_value(payload[key]), 'mm')]
        return []


class NprAnchorAdapter(BaseAdapter):
    """NPR 锚索：F / force / kn / tension"""

    device_type = 'npr_anchor'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        points: list[CanonicalPoint] = []
        for key in ('F', 'force', 'kn', 'tension', 'load'):
            if payload.get(key) is not None:
                unit = str(payload.get('unit') or 'kN')
                points.append(CanonicalPoint('force', parse_value(payload[key]), unit))
                break
        for key in ('stress', 'sigma'):
            if payload.get(key) is not None:
                points.append(CanonicalPoint('stress', parse_value(payload[key]), 'MPa'))
        return points


class GnssAdapter(BaseAdapter):
    """GNSS：dx/dy/dz → displacement 分通道 E/N/U，并生成水平合位移 H 供预警"""

    device_type = 'gnss'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        if payload.get('disp') is not None or payload.get('displacement') is not None:
            v = payload.get('disp', payload.get('displacement'))
            return [CanonicalPoint('displacement', parse_value(v), 'mm', channel='H')]

        axes = (
            ('dx', 'E', 'mm'),
            ('dy', 'N', 'mm'),
            ('dz', 'U', 'mm'),
            ('east', 'E', 'mm'),
            ('north', 'N', 'mm'),
            ('up', 'U', 'mm'),
        )
        points: list[CanonicalPoint] = []
        by_axis: dict[str, float] = {}
        for key, channel, unit in axes:
            if payload.get(key) is not None:
                val = parse_value(payload[key])
                points.append(CanonicalPoint('displacement', val, unit, channel=channel))
                by_axis[channel] = float(val)

        if 'E' in by_axis and 'N' in by_axis:
            import math
            from decimal import Decimal

            mag = Decimal(str(round(math.hypot(by_axis['E'], by_axis['N']), 4)))
            points.append(CanonicalPoint('displacement', mag, 'mm', channel='H'))
        elif payload.get('x') is not None and payload.get('y') is not None:
            import math
            from decimal import Decimal

            x = float(payload['x'])
            y = float(payload['y'])
            mag = Decimal(str(round(math.hypot(x, y), 4)))
            return [
                CanonicalPoint('displacement', parse_value(x), 'mm', channel='E'),
                CanonicalPoint('displacement', parse_value(y), 'mm', channel='N'),
                CanonicalPoint('displacement', mag, 'mm', channel='H'),
            ]
        return points


class FiberOpticAdapter(BaseAdapter):
    """光纤光栅：strain / stress / temp"""

    device_type = 'fiber_optic'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        points: list[CanonicalPoint] = []
        if payload.get('strain') is not None or payload.get('με') is not None:
            v = payload.get('strain', payload.get('με'))
            points.append(CanonicalPoint('strain', parse_value(v), 'με'))
        if payload.get('stress') is not None:
            points.append(CanonicalPoint('stress', parse_value(payload['stress']), 'MPa'))
        if payload.get('temp') is not None or payload.get('temperature') is not None:
            v = payload.get('temp', payload.get('temperature'))
            points.append(CanonicalPoint('temperature', parse_value(v), '℃'))
        return points


class CameraAdapter(BaseAdapter):
    """摄像头：温度/环境量；无测值则跳过（事件类不入库）"""

    device_type = 'camera'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        for key in ('temp', 'temperature', 'T'):
            if payload.get(key) is not None:
                return [CanonicalPoint('temperature', parse_value(payload[key]), '℃')]
        return []


class InclinometerAdapter(BaseAdapter):
    """倾角仪：tilt → displacement 分通道，不把多轴混成一条位移"""

    device_type = 'inclinometer'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        if payload.get('tilt') is not None:
            return [CanonicalPoint('displacement', parse_value(payload['tilt']), 'deg', channel='H')]
        points: list[CanonicalPoint] = []
        for key, channel in (('tilt_x', 'X'), ('tilt_y', 'Y'), ('angle', 'H')):
            if payload.get(key) is not None:
                points.append(
                    CanonicalPoint('displacement', parse_value(payload[key]), 'deg', channel=channel)
                )
        return points


class OthersAdapter(BaseAdapter):
    """其它：尽量从常见字段猜测"""

    device_type = 'others'

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        mapping = (
            ('rainfall', 'rainfall', 'mm'),
            ('force', 'force', 'kN'),
            ('displacement', 'displacement', 'mm'),
            ('stress', 'stress', 'MPa'),
            ('strain', 'strain', 'με'),
            ('temperature', 'temperature', '℃'),
            ('temp', 'temperature', '℃'),
        )
        for key, dtype, unit in mapping:
            if payload.get(key) is not None:
                return [CanonicalPoint(dtype, parse_value(payload[key]), unit)]
        return []


ADAPTERS: dict[str, BaseAdapter] = {
    RainfallAdapter.device_type: RainfallAdapter(),
    NprAnchorAdapter.device_type: NprAnchorAdapter(),
    GnssAdapter.device_type: GnssAdapter(),
    FiberOpticAdapter.device_type: FiberOpticAdapter(),
    CameraAdapter.device_type: CameraAdapter(),
    InclinometerAdapter.device_type: InclinometerAdapter(),
    OthersAdapter.device_type: OthersAdapter(),
}


def get_adapter(device_type: str) -> BaseAdapter:
    adapter = ADAPTERS.get(device_type) or ADAPTERS['others']
    return adapter
