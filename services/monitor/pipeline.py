"""Telemetry ingest pipeline: adapt → redis → PG/influx → warning evaluate."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy.orm import Session

from common import redis_client
from common.config import INTERNAL_SERVICE_TOKEN, warning_service_url
from iot_adapters import expand_to_canonical, extract_device_code
from models import MonitorData, MonitoringDevice, MqttIngestLog
from redis_state import set_device_latest, touch_device_online
from tsdb import dual_write_pg, write_monitor_point
from utils import naive_utc, utcnow

logger = logging.getLogger(__name__)


def extract_trace_id(payload: dict | None = None, header: str | None = None) -> str:
    if header and header.strip():
        return header.strip()[:64]
    if payload:
        for key in ("trace_id", "traceId"):
            val = payload.get(key)
            if val:
                return str(val).strip()[:64]
    return uuid.uuid4().hex


def _evaluate_warning(norm: dict[str, Any], device: MonitoringDevice) -> dict | None:
    body = {
        "device_id": device.id,
        "device_code": device.code,
        "device_name": device.name,
        "hazard_point_id": device.hazard_point_id,
        "data_type": norm["data_type"],
        "channel": norm.get("channel") or "",
        "value": float(norm["value"]),
        "unit": norm.get("unit") or "",
        "record_time": norm["record_time"].isoformat()
        if isinstance(norm["record_time"], datetime)
        else str(norm["record_time"]),
    }
    try:
        url = f"{warning_service_url()}/internal/evaluate"
        resp = httpx.post(
            url,
            json=body,
            headers={"X-Internal-Token": INTERNAL_SERVICE_TOKEN},
            timeout=5.0,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("warning evaluate failed: %s", exc)
    return {"triggered": False, "error": "warning service unavailable"}


def persist_telemetry(db: Session, norm: dict[str, Any]) -> tuple[MonitorData | None, dict | None]:
    device = (
        db.query(MonitoringDevice)
        .filter(MonitoringDevice.code == norm["device_code"])
        .first()
    )
    if not device:
        raise ValueError(f"设备不存在: {norm['device_code']}")

    record_time = norm["record_time"]
    if isinstance(record_time, datetime) and record_time.tzinfo:
        record_time = naive_utc(record_time)
    elif isinstance(record_time, datetime):
        record_time = record_time

    data: MonitorData | None = None
    if dual_write_pg():
        data = MonitorData(
            device_id=device.id,
            data_type=norm["data_type"],
            channel=norm.get("channel") or "",
            value=Decimal(str(norm["value"])),
            unit=norm.get("unit") or "",
            record_time=record_time,
            created_at=naive_utc(utcnow()),
        )
        db.add(data)
        db.flush()

    try:
        write_monitor_point(
            device_id=device.id,
            device_code=device.code,
            data_type=norm["data_type"],
            value=float(norm["value"]),
            unit=norm.get("unit") or "",
            channel=norm.get("channel") or "",
            record_time=record_time,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("tsdb write failed: %s", exc)
        if not dual_write_pg():
            raise

    device.last_data_time = record_time
    device.status = "online"
    device.updated_at = naive_utc(utcnow())
    if norm.get("battery") is not None:
        device.battery = max(0, min(100, int(norm["battery"])))
    if norm.get("signal"):
        device.signal = norm["signal"]

    warning_result = _evaluate_warning(norm, device)
    db.flush()
    return data, warning_result


def _push_adapter_fail_alert(payload: dict, topic: str, error: str, trace_id: str) -> None:
    code = extract_device_code(payload, topic) or "unknown"
    alert = {
        "type": "adapter_or_ingest_fail",
        "device_code": code,
        "topic": topic,
        "trace_id": trace_id,
        "error": error[:300],
        "message": "报文适配/入库失败，监测曲线可能静默断更，请核对厂商字段",
        "at": datetime.now(timezone.utc).isoformat(),
        "payload_keys": list(payload.keys()) if isinstance(payload, dict) else [],
    }
    items = redis_client.get("iot:ops_alerts") or []
    if not isinstance(items, list):
        items = []
    items.insert(0, alert)
    redis_client.set("iot:ops_alerts", items[:100], ttl=7 * 24 * 3600)
    redis_client.set(f"iot:adapter_fail:{code}", alert, ttl=6 * 3600)
    count = int(redis_client.get(f"iot:adapter_fail_count:{code}") or 0) + 1
    redis_client.set(f"iot:adapter_fail_count:{code}", count, ttl=6 * 3600)


def process_telemetry_payload(
    db: Session,
    payload: dict[str, Any],
    *,
    topic: str = "",
    persist: bool = True,
    log: bool = True,
    trace_id: str | None = None,
) -> dict[str, Any]:
    tid = trace_id or extract_trace_id(payload)
    log_row: MqttIngestLog | None = None

    if log:
        log_row = MqttIngestLog(
            topic=topic[:200],
            device_code=extract_device_code(payload, topic)[:50],
            payload=payload if isinstance(payload, dict) else {},
            status="accepted",
            trace_id=tid[:64],
            created_at=naive_utc(utcnow()),
        )
        db.add(log_row)
        db.flush()

    try:
        norms = expand_to_canonical(payload, topic=topic, db=db)
        device_code = norms[0]["device_code"]
        if log_row:
            log_row.device_code = device_code

        points_latest = [
            {
                "data_type": n["data_type"],
                "channel": n.get("channel") or "",
                "value": str(n["value"]),
                "unit": n["unit"],
                "record_time": n["record_time"].isoformat()
                if isinstance(n["record_time"], datetime)
                else str(n["record_time"]),
            }
            for n in norms
        ]
        primary = next((n for n in norms if (n.get("channel") or "") in ("", "H")), norms[0])
        latest = {
            "device_code": device_code,
            "device_type": primary.get("device_type"),
            "data_type": primary["data_type"],
            "channel": primary.get("channel") or "",
            "value": str(primary["value"]),
            "unit": primary["unit"],
            "record_time": primary["record_time"].isoformat()
            if isinstance(primary["record_time"], datetime)
            else str(primary["record_time"]),
            "battery": primary.get("battery"),
            "signal": primary.get("signal"),
            "points": points_latest,
            "trace_id": tid,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        set_device_latest(device_code, latest)
        touch_device_online(device_code)

        monitor_data_ids: list[int] = []
        warnings: list[dict] = []
        if persist:
            for norm in norms:
                data, warning_result = persist_telemetry(db, norm)
                if data and data.id:
                    monitor_data_ids.append(data.id)
                if warning_result:
                    warnings.append(warning_result)
            redis_client.delete(f"iot:adapter_fail_count:{device_code}")
            redis_client.delete(f"iot:adapter_fail:{device_code}")

        if log_row:
            log_row.status = "processed"
            log_row.monitor_data_id = monitor_data_ids[0] if monitor_data_ids else None

        db.commit()
        return {
            "ok": True,
            "trace_id": tid,
            "device_code": device_code,
            "device_type": primary.get("device_type"),
            "points": points_latest,
            "monitor_data_ids": monitor_data_ids,
            "monitor_data_id": monitor_data_ids[0] if monitor_data_ids else None,
            "latest": latest,
            "persisted": persist,
            "warnings": warnings,
        }
    except Exception as exc:
        db.rollback()
        if log_row:
            log_row.status = "failed"
            log_row.error = str(exc)[:300]
            db.add(log_row)
            db.commit()
        _push_adapter_fail_alert(payload if isinstance(payload, dict) else {}, topic, str(exc), tid)
        raise


def persist_manual_data(db: Session, body: dict[str, Any]) -> tuple[MonitorData, dict | None]:
    from constants import DATA_TYPE_VALUES, DEFAULT_UNITS

    device = db.query(MonitoringDevice).filter(MonitoringDevice.id == body["device"]).first()
    if not device:
        raise ValueError("设备不存在")

    data_type = body["data_type"]
    if data_type not in DATA_TYPE_VALUES:
        raise ValueError(f'无效数据类型，可选: {", ".join(sorted(DATA_TYPE_VALUES))}')

    record_time = body.get("record_time") or naive_utc(utcnow())
    if isinstance(record_time, str):
        from utils import parse_datetime_param
        record_time = parse_datetime_param(record_time) or naive_utc(utcnow())

    norm = {
        "device_code": device.code,
        "data_type": data_type,
        "channel": body.get("channel") or "",
        "value": body["value"],
        "unit": body.get("unit") or DEFAULT_UNITS.get(data_type, ""),
        "record_time": record_time,
    }
    data, warning = persist_telemetry(db, norm)
    if data is None:
        raise RuntimeError("TSDB-only mode without dual write not supported for manual ingest")
    db.commit()
    db.refresh(data)
    return data, warning
