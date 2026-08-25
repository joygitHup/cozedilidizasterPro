"""Shared helpers: serialization, time range, thresholds."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from common.config import warning_service_url
from constants import (
    DATA_TYPE,
    DEFAULT_THRESHOLDS,
    DEFAULT_UNITS,
    DEVICE_TYPE,
    SIGNAL,
    STATUS,
    CODE_PREFIX,
)
from models import HazardPoint, MonitorData, MonitoringDevice, WarningRecord

logger = logging.getLogger(__name__)

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def naive_utc(dt: datetime) -> datetime:
    """Store as naive UTC for SQLite/Postgres compatibility."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def parse_datetime_param(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return naive_utc(dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))


def resolve_time_range(
    *,
    range_key: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
) -> tuple[datetime, datetime, str]:
    end = parse_datetime_param(end_time) or naive_utc(utcnow())
    if start_time:
        start = parse_datetime_param(start_time)
        if start:
            return start, end, "custom"
    key = (range_key or "").strip() or "24h"
    delta = RANGE_MAP.get(key, RANGE_MAP["24h"])
    if key not in RANGE_MAP and key != "custom":
        key = "24h"
    return end - delta, end, key


def get_thresholds(data_type: str) -> dict[str, float]:
    try:
        from common.config import INTERNAL_SERVICE_TOKEN

        url = f"{warning_service_url()}/internal/engine-threshold"
        resp = httpx.get(
            url,
            params={"data_type": data_type},
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=3.0,
        )
        if resp.status_code == 200:
            body = resp.json()
            th = body.get("thresholds") or body
            return {k: float(v) for k, v in th.items() if k in ("yellow", "orange", "red", "change_rate_red")}
    except Exception as exc:  # noqa: BLE001
        logger.debug("threshold proxy failed: %s", exc)
    defaults = DEFAULT_THRESHOLDS.get(data_type, {})
    return {k: float(v) for k, v in defaults.items()}


def level_for_value(value: float, thresholds: dict) -> str:
    if value >= float(thresholds.get("red", 1e18)):
        return "red"
    if value >= float(thresholds.get("orange", 1e18)):
        return "orange"
    if value >= float(thresholds.get("yellow", 1e18)):
        return "yellow"
    return "normal"


def is_stale(device: MonitoringDevice) -> bool:
    if not device.last_data_time:
        return device.status == "online"
    cutoff = naive_utc(utcnow()) - timedelta(hours=24)
    ldt = device.last_data_time
    return ldt < cutoff


def device_to_dict(
    device: MonitoringDevice,
    *,
    db: Session | None = None,
    include_data_count: bool = False,
) -> dict[str, Any]:
    hp = device.hazard_point
    data: dict[str, Any] = {
        "id": device.id,
        "code": device.code,
        "name": device.name,
        "device_type": device.device_type,
        "device_type_display": DEVICE_TYPE.get(device.device_type, device.device_type),
        "status": device.status,
        "status_display": STATUS.get(device.status, device.status),
        "longitude": float(device.longitude),
        "latitude": float(device.latitude),
        "address": device.address or "",
        "city": device.city or "",
        "district": device.district or "",
        "county": device.county or "",
        "village": device.village or "",
        "town": device.town or "",
        "hazard_point": device.hazard_point_id,
        "hazard_point_name": hp.name if hp else None,
        "hazard_point_code": hp.code if hp else None,
        "install_date": device.install_date.isoformat() if device.install_date else None,
        "range_value": device.range_value or "",
        "accuracy": device.accuracy or "",
        "power_consumption": float(device.power_consumption or 0),
        "battery": device.battery,
        "signal": device.signal,
        "signal_display": SIGNAL.get(device.signal, device.signal),
        "last_data_time": device.last_data_time.isoformat() if device.last_data_time else None,
        "is_stale": is_stale(device),
        "low_battery": device.battery < 20,
        "created_at": device.created_at.isoformat() if device.created_at else None,
        "updated_at": device.updated_at.isoformat() if device.updated_at else None,
    }
    if include_data_count and db is not None:
        data["data_count"] = (
            db.query(func.count(MonitorData.id))
            .filter(MonitorData.device_id == device.id)
            .scalar()
            or 0
        )
    return data


def monitor_data_to_dict(row: MonitorData) -> dict[str, Any]:
    dev = row.device
    hp = dev.hazard_point if dev else None
    return {
        "id": row.id,
        "device": row.device_id,
        "device_code": dev.code if dev else "",
        "device_name": dev.name if dev else "",
        "data_type": row.data_type,
        "data_type_display": DATA_TYPE.get(row.data_type, row.data_type),
        "channel": row.channel or "",
        "value": float(row.value),
        "unit": row.unit or "",
        "record_time": row.record_time.isoformat() if row.record_time else None,
        "hazard_point_id": dev.hazard_point_id if dev else None,
        "hazard_point_code": hp.code if hp else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def apply_device_filters(
    qs,
    *,
    search: str | None = None,
    device_type: str | None = None,
    status: str | None = None,
    hazard_point: str | None = None,
    signal: str | None = None,
    low_battery: str | None = None,
    stale: str | None = None,
    unlinked: str | None = None,
):
    if device_type:
        qs = qs.filter(MonitoringDevice.device_type == device_type)
    if status:
        qs = qs.filter(MonitoringDevice.status == status)
    if hazard_point:
        qs = qs.filter(MonitoringDevice.hazard_point_id == int(hazard_point))
    if signal:
        qs = qs.filter(MonitoringDevice.signal == signal)
    if low_battery in ("1", "true", "True"):
        qs = qs.filter(MonitoringDevice.battery < 20)
    if stale in ("1", "true", "True"):
        cutoff = naive_utc(utcnow()) - timedelta(hours=24)
        qs = qs.filter(
            or_(MonitoringDevice.last_data_time < cutoff, MonitoringDevice.last_data_time.is_(None)),
            MonitoringDevice.status == "online",
        )
    if unlinked in ("1", "true", "True"):
        qs = qs.filter(MonitoringDevice.hazard_point_id.is_(None))
    if search:
        term = f"%{search.strip()}%"
        qs = qs.outerjoin(HazardPoint, MonitoringDevice.hazard_point_id == HazardPoint.id).filter(
            or_(
                MonitoringDevice.name.ilike(term),
                MonitoringDevice.code.ilike(term),
                MonitoringDevice.address.ilike(term),
                HazardPoint.name.ilike(term),
                HazardPoint.code.ilike(term),
            )
        )
    return qs


def next_device_code(db: Session, device_type: str = "others") -> str:
    prefix = CODE_PREFIX.get(device_type, "DEV")
    rows = (
        db.query(MonitoringDevice.code)
        .filter(MonitoringDevice.code.like(f"{prefix}-%"))
        .order_by(MonitoringDevice.code.desc())
        .all()
    )
    max_n = 0
    for (code,) in rows:
        suffix = code.split("-")[-1]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    return f"{prefix}-{max_n + 1:03d}"


def get_device_or_404(db: Session, device_id: int) -> MonitoringDevice:
    device = (
        db.query(MonitoringDevice)
        .options(joinedload(MonitoringDevice.hazard_point))
        .filter(MonitoringDevice.id == device_id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    return device


def validate_device_payload(data: dict[str, Any], db: Session, instance: MonitoringDevice | None = None):
    name = (data.get("name") or (instance.name if instance else "") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail={"name": "设备名称不能为空"})

    code = data.get("code")
    if code is not None:
        code = str(code).strip().upper()
        if code:
            q = db.query(MonitoringDevice).filter(MonitoringDevice.code == code)
            if instance:
                q = q.filter(MonitoringDevice.id != instance.id)
            if q.first():
                raise HTTPException(status_code=400, detail="设备编号已存在")

    battery = data.get("battery", instance.battery if instance else 100)
    if battery is not None and not 0 <= int(battery) <= 100:
        raise HTTPException(status_code=400, detail="电量须在 0–100 之间")

    lng = data.get("longitude", instance.longitude if instance else None)
    lat = data.get("latitude", instance.latitude if instance else None)
    hazard_id = data.get("hazard_point", instance.hazard_point_id if instance else None)

    if hazard_id:
        hp = db.query(HazardPoint).filter(HazardPoint.id == hazard_id).first()
        if not hp:
            raise HTTPException(status_code=400, detail="关联隐患点不存在")
        if lng is None:
            lng = hp.longitude
            data["longitude"] = lng
        if lat is None:
            lat = hp.latitude
            data["latitude"] = lat
        if not data.get("address") and not (instance.address if instance else ""):
            data["address"] = hp.address or hp.name

    if lng is None or lat is None:
        raise HTTPException(status_code=400, detail={"longitude": "经纬度必填（或关联隐患点自动带入）"})
    try:
        lng_f, lat_f = float(lng), float(lat)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="经纬度格式无效")
    if not (-180 <= lng_f <= 180) or not (-90 <= lat_f <= 90):
        raise HTTPException(status_code=400, detail="经纬度超出有效范围")


def open_warnings_for_hazard(db: Session, hazard_point_id: int, limit: int = 10) -> list[dict]:
    rows = (
        db.query(WarningRecord)
        .filter(
            WarningRecord.hazard_point_id == hazard_point_id,
            WarningRecord.status != "closed",
        )
        .order_by(WarningRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "code": r.code,
            "level": r.level,
            "status": r.status,
            "trigger_type": r.trigger_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def hazard_summary(hp: HazardPoint | None) -> dict | None:
    if not hp:
        return None
    return {
        "id": hp.id,
        "code": hp.code,
        "name": hp.name,
        "level": hp.level,
        "status": hp.status,
    }


def build_list_url(request: Request, path: str) -> str:
    return str(request.url.replace(path=path, query="")).rstrip("?")
