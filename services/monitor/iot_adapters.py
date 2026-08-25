"""IoT payload adapters — port of backend/monitoring/iot/adapters without Django."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from constants import DATA_TYPE_VALUES
from models import MonitoringDevice


@dataclass
class CanonicalPoint:
    data_type: str
    value: Decimal
    unit: str = ""
    channel: str = ""


def extract_device_code(payload: dict[str, Any], topic: str = "") -> str:
    for key in (
        "device_code", "deviceCode", "code", "devId", "dev_id",
        "sn", "imei", "id", "cam", "device",
    ):
        raw = payload.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    if not topic:
        return ""
    parts = [p for p in topic.strip("/").split("/") if p]
    if len(parts) >= 4 and parts[0] == "geo" and parts[1] == "telemetry":
        return parts[3]
    if len(parts) >= 3 and parts[0] == "geo" and parts[1] == "telemetry":
        return parts[2]
    return parts[-1] if parts else ""


def is_canonical(payload: dict[str, Any]) -> bool:
    has_type = bool(payload.get("data_type") or payload.get("dataType"))
    has_value = payload.get("value") is not None
    return has_type and has_value


def parse_value(raw: Any) -> Decimal:
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"无效数值: {raw}") from exc


def parse_time(raw: Any) -> datetime:
    if raw is None or raw == "":
        return datetime.now(timezone.utc)
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    if isinstance(raw, (int, float)):
        ts = float(raw)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    text = str(raw).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"无法解析时间: {raw}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_battery(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        return max(0, min(100, int(float(raw))))
    except (TypeError, ValueError):
        return None


def parse_signal(raw: Any) -> str | None:
    if raw is None or raw == "":
        return None
    text = str(raw).strip().lower()
    if text.lstrip("-").isdigit() or text.replace(".", "", 1).lstrip("-").isdigit():
        try:
            rssi = float(text)
            if rssi >= -70:
                return "strong"
            if rssi >= -85:
                return "medium"
            return "weak"
        except ValueError:
            pass
    mapping = {
        "strong": "strong", "medium": "medium", "weak": "weak",
        "高": "strong", "中": "medium", "低": "weak",
        "good": "strong", "ok": "medium", "bad": "weak",
    }
    return mapping.get(text)


class BaseAdapter:
    device_type: str = ""

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        raise NotImplementedError


class RainfallAdapter(BaseAdapter):
    device_type = "rainfall"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        for key in ("rain_mm", "rain", "R", "rainfall", "precip", "value_mm"):
            if payload.get(key) is not None:
                return [CanonicalPoint("rainfall", parse_value(payload[key]), "mm")]
        return []


class NprAnchorAdapter(BaseAdapter):
    device_type = "npr_anchor"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        points: list[CanonicalPoint] = []
        for key in ("F", "force", "kn", "tension", "load"):
            if payload.get(key) is not None:
                unit = str(payload.get("unit") or "kN")
                points.append(CanonicalPoint("force", parse_value(payload[key]), unit))
                break
        for key in ("stress", "sigma"):
            if payload.get(key) is not None:
                points.append(CanonicalPoint("stress", parse_value(payload[key]), "MPa"))
        return points


class GnssAdapter(BaseAdapter):
    device_type = "gnss"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        if payload.get("disp") is not None or payload.get("displacement") is not None:
            v = payload.get("disp", payload.get("displacement"))
            return [CanonicalPoint("displacement", parse_value(v), "mm", channel="H")]

        axes = (
            ("dx", "E", "mm"), ("dy", "N", "mm"), ("dz", "U", "mm"),
            ("east", "E", "mm"), ("north", "N", "mm"), ("up", "U", "mm"),
        )
        points: list[CanonicalPoint] = []
        by_axis: dict[str, float] = {}
        for key, channel, unit in axes:
            if payload.get(key) is not None:
                val = parse_value(payload[key])
                points.append(CanonicalPoint("displacement", val, unit, channel=channel))
                by_axis[channel] = float(val)

        if "E" in by_axis and "N" in by_axis:
            mag = Decimal(str(round(math.hypot(by_axis["E"], by_axis["N"]), 4)))
            points.append(CanonicalPoint("displacement", mag, "mm", channel="H"))
        elif payload.get("x") is not None and payload.get("y") is not None:
            x = float(payload["x"])
            y = float(payload["y"])
            mag = Decimal(str(round(math.hypot(x, y), 4)))
            return [
                CanonicalPoint("displacement", parse_value(x), "mm", channel="E"),
                CanonicalPoint("displacement", parse_value(y), "mm", channel="N"),
                CanonicalPoint("displacement", mag, "mm", channel="H"),
            ]
        return points


class FiberOpticAdapter(BaseAdapter):
    device_type = "fiber_optic"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        points: list[CanonicalPoint] = []
        if payload.get("strain") is not None or payload.get("με") is not None:
            v = payload.get("strain", payload.get("με"))
            points.append(CanonicalPoint("strain", parse_value(v), "με"))
        if payload.get("stress") is not None:
            points.append(CanonicalPoint("stress", parse_value(payload["stress"]), "MPa"))
        if payload.get("temp") is not None or payload.get("temperature") is not None:
            v = payload.get("temp", payload.get("temperature"))
            points.append(CanonicalPoint("temperature", parse_value(v), "℃"))
        return points


class CameraAdapter(BaseAdapter):
    device_type = "camera"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        for key in ("temp", "temperature", "T"):
            if payload.get(key) is not None:
                return [CanonicalPoint("temperature", parse_value(payload[key]), "℃")]
        return []


class InclinometerAdapter(BaseAdapter):
    device_type = "inclinometer"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        if payload.get("tilt") is not None:
            return [CanonicalPoint("displacement", parse_value(payload["tilt"]), "deg", channel="H")]
        points: list[CanonicalPoint] = []
        for key, channel in (("tilt_x", "X"), ("tilt_y", "Y"), ("angle", "H")):
            if payload.get(key) is not None:
                points.append(
                    CanonicalPoint("displacement", parse_value(payload[key]), "deg", channel=channel)
                )
        return points


class OthersAdapter(BaseAdapter):
    device_type = "others"

    def parse(self, payload: dict[str, Any], *, device: MonitoringDevice) -> list[CanonicalPoint]:
        mapping = (
            ("rainfall", "rainfall", "mm"),
            ("force", "force", "kN"),
            ("displacement", "displacement", "mm"),
            ("stress", "stress", "MPa"),
            ("strain", "strain", "με"),
            ("temperature", "temperature", "℃"),
            ("temp", "temperature", "℃"),
        )
        for key, dtype, unit in mapping:
            if payload.get(key) is not None:
                return [CanonicalPoint(dtype, parse_value(payload[key]), unit)]
        return []


ADAPTERS: dict[str, BaseAdapter] = {
    "rainfall": RainfallAdapter(),
    "npr_anchor": NprAnchorAdapter(),
    "gnss": GnssAdapter(),
    "fiber_optic": FiberOpticAdapter(),
    "camera": CameraAdapter(),
    "inclinometer": InclinometerAdapter(),
    "others": OthersAdapter(),
}


def get_adapter(device_type: str) -> BaseAdapter:
    return ADAPTERS.get(device_type) or ADAPTERS["others"]


def expand_to_canonical(
    payload: dict[str, Any],
    *,
    topic: str = "",
    device: MonitoringDevice | None = None,
    db: Session | None = None,
) -> list[dict[str, Any]]:
    code = extract_device_code(payload, topic)
    if not code:
        raise ValueError("缺少 device_code（或 Topic 中无法解析）")

    if device is None:
        if db is None:
            raise ValueError("需要 db session 或 device 对象")
        device = db.query(MonitoringDevice).filter(MonitoringDevice.code == code).first()
    if device is None:
        raise ValueError(f"设备不存在: {code}")

    battery = parse_battery(
        payload.get("battery") or payload.get("bat") or payload.get("batt") or payload.get("Battery")
    )
    signal = parse_signal(payload.get("signal") or payload.get("rssi") or payload.get("Signal"))
    record_time = parse_time(
        payload.get("record_time") or payload.get("recordTime")
        or payload.get("ts") or payload.get("time") or payload.get("timestamp")
    )

    if is_canonical(payload):
        data_type = (payload.get("data_type") or payload.get("dataType") or "").strip()
        if data_type not in DATA_TYPE_VALUES:
            raise ValueError(
                f"无效 data_type: {data_type}，可选: {', '.join(DATA_TYPE_VALUES)}"
            )
        points = [
            CanonicalPoint(
                data_type=data_type,
                value=parse_value(payload.get("value")),
                unit=(payload.get("unit") or "").strip(),
                channel=str(payload.get("channel") or "").strip().upper(),
            )
        ]
    else:
        adapter = get_adapter(device.device_type)
        points = adapter.parse(payload, device=device)
        if not points:
            raise ValueError(
                f"设备类型 {device.device_type} 未能从报文解析出测点，"
                f"请检查字段或改用标准格式 data_type+value"
            )

    out: list[dict[str, Any]] = []
    for p in points:
        if p.data_type not in DATA_TYPE_VALUES:
            raise ValueError(f"适配器产出无效 data_type: {p.data_type}")
        out.append(
            {
                "device_code": device.code,
                "device_type": device.device_type,
                "data_type": p.data_type,
                "channel": (p.channel or "").strip().upper(),
                "value": p.value,
                "unit": p.unit,
                "record_time": record_time,
                "battery": battery,
                "signal": signal,
                "topic": topic,
            }
        )
    return out
