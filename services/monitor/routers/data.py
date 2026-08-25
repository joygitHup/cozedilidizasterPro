"""Monitor data endpoints."""
from __future__ import annotations

import csv
import io
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from common.auth import optional_user, require_user
from constants import DATA_TYPE, DATA_TYPE_VALUES, DEFAULT_UNITS, DEVICE_DEFAULT_DATA_TYPE, PARAM_SCALE
from models import MonitorData, MonitoringDevice, WarningRecord
from pipeline import persist_manual_data
from schemas import MonitorDataCreate
from tsdb import distinct_data_types, query_points, use_external_reads
from utils import (
    device_to_dict,
    get_device_or_404,
    get_thresholds,
    hazard_summary,
    level_for_value,
    monitor_data_to_dict,
    naive_utc,
    open_warnings_for_hazard,
    resolve_time_range,
    utcnow,
)

router = APIRouter(prefix="/data", tags=["data"])


def get_db():
    from common.db import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/overview/")
def data_overview(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    range: str | None = Query("24h"),
    start_time: str | None = None,
    end_time: str | None = None,
    device_type: str | None = None,
):
    start, end, range_key = resolve_time_range(
        range_key=range, start_time=start_time, end_time=end_time
    )
    qs = db.query(MonitorData).filter(
        MonitorData.record_time >= start,
        MonitorData.record_time <= end,
    )
    if device_type:
        qs = qs.join(MonitoringDevice).filter(MonitoringDevice.device_type == device_type)

    active_devices = (
        db.query(MonitorData.device_id)
        .filter(MonitorData.record_time >= start, MonitorData.record_time <= end)
        .distinct()
        .count()
    )
    online = db.query(MonitoringDevice).filter(MonitoringDevice.status == "online").count()
    open_warnings = db.query(WarningRecord).filter(WarningRecord.status != "closed").count()

    over_count = 0
    for dtype in DATA_TYPE_VALUES:
        th = get_thresholds(dtype)
        yellow = float(th.get("yellow", 0))
        over_count += qs.filter(MonitorData.data_type == dtype, MonitorData.value >= yellow).count()

    return {
        "range": range_key,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "points": qs.count(),
        "active_devices": active_devices,
        "online_devices": online,
        "over_threshold": over_count,
        "open_warnings": open_warnings,
        "by_type": {t: qs.filter(MonitorData.data_type == t).count() for t in DATA_TYPE_VALUES},
    }


@router.get("/series/")
def data_series(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    device_id: int | None = Query(None),
    device: int | None = Query(None),
    data_type: str | None = None,
    range: str | None = Query("24h"),
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = Query(800, le=2000),
):
    did = device_id or device
    if not did:
        raise HTTPException(status_code=400, detail="请指定 device_id")
    device_obj = get_device_or_404(db, did)

    use_ts = use_external_reads()
    if use_ts:
        available = distinct_data_types(device_obj.id)
    else:
        available = [
            r[0]
            for r in db.query(MonitorData.data_type)
            .filter(MonitorData.device_id == device_obj.id)
            .distinct()
            .all()
        ]

    default_type = DEVICE_DEFAULT_DATA_TYPE.get(device_obj.device_type, "force")
    dtype = data_type or (default_type if default_type in available or not available else available[0])

    start, end, range_key = resolve_time_range(
        range_key=range, start_time=start_time, end_time=end_time
    )

    if use_ts:
        td_rows = query_points(
            device_id=device_obj.id,
            data_type=dtype,
            start=start,
            end=end,
            limit=limit,
            order="asc",
        )
        values = [float(r["value"]) for r in td_rows if r.get("value") is not None]
        unit = (td_rows[-1].get("unit") if td_rows else "") or ""
        points = [
            {
                "id": i + 1,
                "time": (
                    r.get("record_time").isoformat()
                    if hasattr(r.get("record_time"), "isoformat")
                    else r.get("record_time") or r.get("ts")
                ),
                "value": float(r["value"]),
                "unit": r.get("unit") or "",
            }
            for i, r in enumerate(td_rows)
            if r.get("value") is not None
        ]
        tsdb_name = "influxdb"
    else:
        rows = (
            db.query(MonitorData)
            .filter(
                MonitorData.device_id == device_obj.id,
                MonitorData.data_type == dtype,
                MonitorData.record_time >= start,
                MonitorData.record_time <= end,
            )
            .order_by(MonitorData.record_time.asc())
            .limit(limit)
            .all()
        )
        values = [float(r.value) for r in rows]
        unit = rows[-1].unit if rows else DEFAULT_UNITS.get(dtype, "")
        points = [
            {
                "id": r.id,
                "time": r.record_time.isoformat() if r.record_time else None,
                "value": float(r.value),
                "unit": r.unit,
            }
            for r in rows
        ]
        tsdb_name = "postgres"

    if not unit:
        unit = DEFAULT_UNITS.get(dtype, "")

    thresholds = get_thresholds(dtype)
    stats = {
        "count": len(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "avg": round(sum(values) / len(values), 4) if values else None,
        "latest": values[-1] if values else None,
        "over_yellow": sum(1 for v in values if v >= float(thresholds.get("yellow", 0))),
        "over_orange": sum(1 for v in values if v >= float(thresholds.get("orange", 0))),
        "over_red": sum(1 for v in values if v >= float(thresholds.get("red", 0))),
    }

    hazard = hazard_summary(device_obj.hazard_point) if device_obj.hazard_point_id else None
    open_warnings = (
        open_warnings_for_hazard(db, device_obj.hazard_point_id) if device_obj.hazard_point_id else []
    )

    return {
        "device": device_to_dict(device_obj, db=db, include_data_count=True),
        "data_type": dtype,
        "data_type_display": DATA_TYPE.get(dtype, dtype),
        "unit": unit,
        "range": range_key,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "thresholds": {
            "yellow": float(thresholds.get("yellow", 0)),
            "orange": float(thresholds.get("orange", 0)),
            "red": float(thresholds.get("red", 0)),
        },
        "points": points,
        "stats": stats,
        "available_types": available or [dtype],
        "hazard_point": hazard,
        "open_warnings": open_warnings,
        "scale_max": PARAM_SCALE.get(dtype, 100),
        "tsdb": tsdb_name,
    }


@router.get("/latest/")
def data_latest(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    device_id: int | None = Query(None),
    device: int | None = Query(None),
):
    did = device_id or device
    if not did:
        raise HTTPException(status_code=400, detail="请指定 device_id")
    device_obj = get_device_or_404(db, did)

    params = []
    for dtype, label in DATA_TYPE.items():
        row = (
            db.query(MonitorData)
            .filter(MonitorData.device_id == device_obj.id, MonitorData.data_type == dtype)
            .order_by(MonitorData.record_time.desc())
            .first()
        )
        if not row:
            continue
        th = get_thresholds(dtype)
        value = float(row.value)
        params.append(
            {
                "data_type": dtype,
                "data_type_display": label,
                "value": value,
                "unit": row.unit,
                "record_time": row.record_time.isoformat() if row.record_time else None,
                "level": level_for_value(value, th),
                "thresholds": {
                    "yellow": float(th.get("yellow", 0)),
                    "orange": float(th.get("orange", 0)),
                    "red": float(th.get("red", 0)),
                },
                "scale_max": PARAM_SCALE.get(dtype, 100),
            }
        )
    return {
        "device_id": device_obj.id,
        "device_code": device_obj.code,
        "params": params,
    }


@router.get("/export/")
def export_data(
    db: Session = Depends(get_db),
    _user: Annotated[int, Depends(require_user)] = 0,
    range: str | None = Query("24h"),
    start_time: str | None = None,
    end_time: str | None = None,
    device_id: int | None = Query(None),
    device: int | None = Query(None),
    data_type: str | None = None,
):
    start, end, _ = resolve_time_range(range_key=range, start_time=start_time, end_time=end_time)
    qs = (
        db.query(MonitorData)
        .options(joinedload(MonitorData.device).joinedload(MonitoringDevice.hazard_point))
        .filter(MonitorData.record_time >= start, MonitorData.record_time <= end)
    )
    did = device_id or device
    if did:
        qs = qs.filter(MonitorData.device_id == did)
    if data_type:
        qs = qs.filter(MonitorData.data_type == data_type)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["设备编号", "设备名称", "数据类型", "数值", "单位", "记录时间", "关联隐患点"])
    for row in qs.order_by(MonitorData.record_time.desc()).limit(5000).all():
        hp = row.device.hazard_point if row.device else None
        writer.writerow([
            row.device.code if row.device else "",
            row.device.name if row.device else "",
            DATA_TYPE.get(row.data_type, row.data_type),
            row.value,
            row.unit,
            row.record_time,
            hp.code if hp else "",
        ])
    content = "\ufeff" + buffer.getvalue()
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="monitor_data.csv"'},
    )


@router.post("/", status_code=201)
def create_data(
    body: MonitorDataCreate,
    db: Session = Depends(get_db),
    _user: int | None = Depends(optional_user),
):
    try:
        data, warning = persist_manual_data(db, body.model_dump())
    except ValueError as exc:
        msg = str(exc)
        code = 404 if "设备不存在" in msg else 400
        raise HTTPException(status_code=code, detail=msg) from exc

    payload = monitor_data_to_dict(data)
    if warning:
        payload["warning"] = warning
    return payload
