"""Redis device latest/online state."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from common import redis_client
from common.config import iot_latest_ttl, iot_online_ttl
from sqlalchemy.orm import Session

from models import MonitorData, MonitoringDevice

logger = logging.getLogger(__name__)

HEALTH_KEY = "iot:redis_health"


def _latest_key(device_code: str) -> str:
    return f"iot:latest:{device_code}"


def _online_key(device_code: str) -> str:
    return f"iot:online:{device_code}"


def mark_redis_ok() -> None:
    redis_client.set(HEALTH_KEY, {"ok": True}, ttl=120)


def mark_redis_degraded(error: str) -> None:
    logger.warning("Redis degraded: %s", error)
    redis_client.set(HEALTH_KEY, {"ok": False, "error": error[:200]}, ttl=300)


def redis_health() -> dict[str, Any]:
    probe = "iot:ping:probe"
    ok = redis_client.set(probe, 1, ttl=10) and redis_client.get(probe) == 1
    if ok:
        mark_redis_ok()
        return {"ok": True}
    mark_redis_degraded("ping mismatch")
    return {"ok": False, "error": "ping mismatch"}


def set_device_latest(device_code: str, payload: dict[str, Any]) -> bool:
    ok = redis_client.set(_latest_key(device_code), payload, ttl=iot_latest_ttl())
    if ok:
        mark_redis_ok()
    else:
        mark_redis_degraded("set latest failed")
    return ok


def get_device_latest(device_code: str, *, db: Session | None = None) -> dict[str, Any] | None:
    data = redis_client.get(_latest_key(device_code))
    if data is None and db is not None:
        return _latest_from_db(db, device_code)
    if isinstance(data, dict):
        data = dict(data)
        data.setdefault("source", "redis")
        return data
    return None


def _latest_from_db(db: Session, device_code: str) -> dict[str, Any] | None:
    device = db.query(MonitoringDevice).filter(MonitoringDevice.code == device_code).first()
    if not device:
        return None
    rows = (
        db.query(MonitorData)
        .filter(MonitorData.device_id == device.id)
        .order_by(MonitorData.record_time.desc())
        .limit(8)
        .all()
    )
    if not rows:
        return None
    primary = rows[0]
    points = [
        {
            "data_type": r.data_type,
            "channel": r.channel or "",
            "value": str(r.value),
            "unit": r.unit,
            "record_time": r.record_time.isoformat(),
        }
        for r in rows
    ]
    return {
        "device_code": device.code,
        "device_type": device.device_type,
        "data_type": primary.data_type,
        "channel": primary.channel or "",
        "value": str(primary.value),
        "unit": primary.unit,
        "record_time": primary.record_time.isoformat(),
        "battery": device.battery,
        "signal": device.signal,
        "points": points,
        "updated_at": primary.record_time.isoformat(),
        "source": "db_fallback",
    }


def set_device_online(device_code: str, online: bool = True) -> bool:
    if online:
        return redis_client.set(_online_key(device_code), 1, ttl=iot_online_ttl())
    return redis_client.delete(_online_key(device_code))


def get_device_online(device_code: str, *, db: Session | None = None) -> bool | None:
    val = redis_client.get(_online_key(device_code))
    if val is not None:
        return bool(val)
    if db is None:
        return None
    device = db.query(MonitoringDevice).filter(MonitoringDevice.code == device_code).first()
    if not device:
        return False
    ttl = iot_online_ttl()
    now = datetime.now(timezone.utc)
    if device.last_data_time:
        ldt = device.last_data_time
        if ldt.tzinfo is None:
            ldt = ldt.replace(tzinfo=timezone.utc)
        if ldt >= now - timedelta(seconds=ttl):
            return True
    return device.status == "online" and bool(device.last_data_time)


def touch_device_online(device_code: str) -> None:
    set_device_online(device_code, True)
