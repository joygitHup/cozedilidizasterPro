"""MQTT / IoT ingest endpoints."""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from auth_ingest import authorize_ingest
from common.config import warning_service_url
from constants import DEFAULT_THRESHOLDS, UNLINKED_ALERT_KEY
from common import redis_client
from iot_adapters import expand_to_canonical
from models import MonitoringDevice, MqttIngestLog
from pipeline import extract_trace_id, process_telemetry_payload
from redis_state import get_device_latest, get_device_online, redis_health

router = APIRouter(prefix="/ingest", tags=["ingest"])

TRACE_HEADER = "X-Trace-Id"


def get_db():
    from common.db import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_ingest(request: Request) -> None:
    ok, detail, code = authorize_ingest(request)
    if not ok:
        raise HTTPException(status_code=code, detail=detail)


def _with_trace(response: Response, trace_id: str) -> None:
    response.headers[TRACE_HEADER] = trace_id


@router.post("/mqtt/", status_code=201)
async def mqtt_ingest(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    _require_ingest(request)
    payload: dict[str, Any] = await request.json()
    if not isinstance(payload, dict):
        payload = {}

    tid = extract_trace_id(payload, request.headers.get(TRACE_HEADER))
    topic = str(payload.get("topic") or "")
    use_async = payload.get("async", True)
    if isinstance(use_async, str):
        use_async = use_async.lower() in ("1", "true", "yes")

    body = {k: v for k, v in payload.items() if k not in ("async", "topic", "trace_id", "traceId")}

    if use_async:
        background_tasks.add_task(
            _process_async,
            body,
            topic,
            tid,
        )
        response.status_code = 202
        _with_trace(response, tid)
        return {
            "ok": True,
            "queued": True,
            "task_id": tid,
            "trace_id": tid,
            "device_code": body.get("device_code") or "",
        }

    try:
        result = process_telemetry_payload(db, body, topic=topic, persist=True, trace_id=tid)
        result["queued"] = False
        _with_trace(response, tid)
        return result
    except ValueError as exc:
        msg = str(exc)
        code = 404 if msg.startswith("设备不存在") else 400
        _with_trace(response, tid)
        raise HTTPException(status_code=code, detail=msg) from exc
    except Exception as exc:
        _with_trace(response, tid)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _process_async(body: dict, topic: str, trace_id: str) -> None:
    from common.db import SessionLocal

    db = SessionLocal()
    try:
        process_telemetry_payload(db, body, topic=topic, persist=True, trace_id=trace_id)
    finally:
        db.close()


@router.post("/preview/")
async def ingest_preview(request: Request, db: Session = Depends(get_db)):
    _require_ingest(request)
    payload: dict[str, Any] = await request.json()
    if not isinstance(payload, dict):
        payload = {}
    topic = str(payload.get("topic") or "")
    body = {k: v for k, v in payload.items() if k not in ("async", "topic")}
    try:
        points = expand_to_canonical(body, topic=topic, db=db)
        return {
            "ok": True,
            "device_code": points[0]["device_code"],
            "device_type": points[0].get("device_type"),
            "points": [
                {
                    "data_type": p["data_type"],
                    "channel": p.get("channel") or "",
                    "value": str(p["value"]),
                    "unit": p["unit"],
                    "record_time": p["record_time"].isoformat()
                    if hasattr(p["record_time"], "isoformat")
                    else str(p["record_time"]),
                }
                for p in points
            ],
        }
    except ValueError as exc:
        msg = str(exc)
        code = 404 if msg.startswith("设备不存在") else 400
        raise HTTPException(status_code=code, detail=msg) from exc


@router.get("/state/")
def ingest_state(
    request: Request,
    device_code: str = Query(...),
    db: Session = Depends(get_db),
):
    _require_ingest(request)
    code = device_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="需要 device_code")
    online = get_device_online(code, db=db)
    return {
        "device_code": code,
        "online": online,
        "online_unknown": online is None,
        "latest": get_device_latest(code, db=db),
        "redis": redis_health(),
        "unlinked_alert": redis_client.get(UNLINKED_ALERT_KEY.format(code=code)),
        "adapter_fail": redis_client.get(f"iot:adapter_fail:{code}"),
        "adapter_fail_count": redis_client.get(f"iot:adapter_fail_count:{code}") or 0,
    }


@router.get("/ops-alerts/")
def ops_alerts(request: Request, db: Session = Depends(get_db)):
    _require_ingest(request)
    alerts = redis_client.get("iot:ops_alerts") or []
    unlinked = (
        db.query(MonitoringDevice)
        .filter(MonitoringDevice.hazard_point_id.is_(None))
        .limit(50)
        .all()
    )
    failed_logs = (
        db.query(MqttIngestLog)
        .filter(MqttIngestLog.status == "failed")
        .order_by(MqttIngestLog.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "ops_alerts": alerts if isinstance(alerts, list) else [],
        "redis": redis_health(),
        "unlinked_devices": [
            {"code": d.code, "name": d.name, "device_type": d.device_type, "status": d.status}
            for d in unlinked
        ],
        "recent_failed_logs": [
            {
                "id": r.id,
                "device_code": r.device_code,
                "topic": r.topic,
                "error": r.error,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in failed_logs
        ],
    }


@router.get("/engine-threshold/")
def engine_threshold(request: Request, data_type: str = Query("rainfall")):
    _require_ingest(request)
    dtype = data_type.strip()
    try:
        url = f"{warning_service_url()}/internal/engine-threshold"
        resp = httpx.get(url, params={"data_type": dtype}, timeout=5.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception:  # noqa: BLE001
        pass
    defaults = DEFAULT_THRESHOLDS.get(dtype, DEFAULT_THRESHOLDS.get("rainfall", {}))
    return {
        "data_type": dtype,
        "model_code": None,
        "model_name": "内置默认阈值",
        "model_id": None,
        "thresholds": defaults,
        "hint": "启用专用模型请 POST /api/warning/models/{id}/activate/ 且 exclusive=true",
    }


@router.get("/logs/")
def ingest_logs(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(50, le=200),
    trace_id: str | None = None,
    device_code: str | None = None,
):
    _require_ingest(request)
    qs = db.query(MqttIngestLog).order_by(MqttIngestLog.created_at.desc())
    if trace_id:
        qs = qs.filter(MqttIngestLog.trace_id == trace_id.strip())
    if device_code:
        qs = qs.filter(MqttIngestLog.device_code == device_code.strip())
    rows = qs.limit(limit).all()
    return [
        {
            "id": r.id,
            "trace_id": r.trace_id,
            "topic": r.topic,
            "device_code": r.device_code,
            "status": r.status,
            "error": r.error,
            "monitor_data_id": r.monitor_data_id,
            "payload": r.payload,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
