"""Warning record API routes."""
from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload

from common.auth import get_current_user
from common.db import get_db
from common.pagination import paginate_query
from engine import OPEN_STATUSES, utcnow
from models import EvacuationTask, HazardPoint, MonitorData, MonitoringDevice, WarningRecord
from schemas import (
    AnalyzeBody,
    CallBody,
    CloseBody,
    ConfirmBody,
    LEVEL_DISPLAY,
    PublishBody,
    STATUS_DISPLAY,
    serialize_record,
    serialize_record_list,
)

router = APIRouter(prefix="/records", tags=["warning-records"])

PROCESSING_STATUSES = ("confirmed", "analyzing", "published", "processing")


def _actor_name(body: dict[str, Any], fallback: str = "confirm_user") -> str:
    for key in (fallback, "publish_user", "caller"):
        value = body.get(key)
        if value:
            return str(value).strip()
    return "值班员"


def _base_query(db: Session):
    return (
        db.query(WarningRecord)
        .options(joinedload(WarningRecord.hazard_point))
        .order_by(desc(WarningRecord.created_at), desc(WarningRecord.id))
    )


def _apply_filters(
    query,
    *,
    level: str | None,
    status: str | None,
    hazard_point: int | None,
    open_only: str | None,
    status_group: str | None,
    search: str | None,
    ordering: str | None,
):
    if level:
        query = query.filter(WarningRecord.level == level)
    if status:
        query = query.filter(WarningRecord.status == status)
    if hazard_point:
        query = query.filter(WarningRecord.hazard_point_id == hazard_point)
    if open_only in ("1", "true", "True"):
        query = query.filter(WarningRecord.status != "closed")
    if status_group == "open":
        query = query.filter(WarningRecord.status.in_(OPEN_STATUSES))
    elif status_group == "pending":
        query = query.filter(WarningRecord.status == "pending")
    elif status_group == "processing":
        query = query.filter(WarningRecord.status.in_(PROCESSING_STATUSES))
    elif status_group == "closed":
        query = query.filter(WarningRecord.status == "closed")
    if search:
        like = f"%{search.strip()}%"
        query = query.join(HazardPoint, WarningRecord.hazard_point_id == HazardPoint.id).filter(
            or_(
                WarningRecord.code.ilike(like),
                WarningRecord.trigger_type.ilike(like),
                HazardPoint.name.ilike(like),
                HazardPoint.code.ilike(like),
            )
        )
    if ordering:
        desc_flag = ordering.startswith("-")
        field = ordering.lstrip("-")
        column = getattr(WarningRecord, field, None)
        if column is not None:
            query = query.order_by(desc(column) if desc_flag else column.asc())
    return query


def _get_record(db: Session, record_id: int) -> WarningRecord:
    record = (
        db.query(WarningRecord)
        .options(joinedload(WarningRecord.hazard_point))
        .filter(WarningRecord.id == record_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="未找到预警记录")
    return record


@router.get("/")
def list_records(
    request: Request,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, alias="page_size"),
    level: str | None = None,
    status: str | None = None,
    hazard_point: int | None = None,
    open_only: str | None = None,
    status_group: str | None = None,
    search: str | None = None,
    ordering: str | None = None,
):
    query = _apply_filters(
        _base_query(db),
        level=level,
        status=status,
        hazard_point=hazard_point,
        open_only=open_only,
        status_group=status_group,
        search=search,
        ordering=ordering,
    )
    return paginate_query(
        request,
        query,
        page=page,
        page_size=page_size,
        serializer=serialize_record_list,
    )


@router.get("/statistics/")
def statistics(
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    all_qs = db.query(WarningRecord)
    open_qs = all_qs.filter(WarningRecord.status != "closed")
    return {
        "total": all_qs.count(),
        "open": open_qs.count(),
        "pending": all_qs.filter(WarningRecord.status == "pending").count(),
        "processing": all_qs.filter(WarningRecord.status.in_(PROCESSING_STATUSES)).count(),
        "closed": all_qs.filter(WarningRecord.status == "closed").count(),
        "by_level": {
            "red": all_qs.filter(WarningRecord.level == "red").count(),
            "orange": all_qs.filter(WarningRecord.level == "orange").count(),
            "yellow": all_qs.filter(WarningRecord.level == "yellow").count(),
            "blue": all_qs.filter(WarningRecord.level == "blue").count(),
        },
        "open_by_level": {
            "red": open_qs.filter(WarningRecord.level == "red").count(),
            "orange": open_qs.filter(WarningRecord.level == "orange").count(),
            "yellow": open_qs.filter(WarningRecord.level == "yellow").count(),
            "blue": open_qs.filter(WarningRecord.level == "blue").count(),
        },
        "filtered_total": all_qs.count(),
    }


@router.get("/latest/")
def latest(
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
    open_only: str = Query("1"),
):
    query = _base_query(db)
    if open_only in ("1", "true", "True", ""):
        query = query.filter(WarningRecord.status != "closed")
    rows = query.limit(limit).all()
    return [serialize_record(row) for row in rows]


@router.get("/export/")
def export_records(
    request: Request,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    level: str | None = None,
    status: str | None = None,
    hazard_point: int | None = None,
    open_only: str | None = None,
    status_group: str | None = None,
    search: str | None = None,
):
    query = _apply_filters(
        _base_query(db),
        level=level,
        status=status,
        hazard_point=hazard_point,
        open_only=open_only,
        status_group=status_group,
        search=search,
        ordering=None,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "编号",
            "隐患点编号",
            "隐患点",
            "等级",
            "状态",
            "触发类型",
            "置信度",
            "确认人",
            "发布人",
            "闭环原因",
            "创建时间",
            "闭环时间",
        ]
    )
    for w in query.limit(5000).all():
        hp = w.hazard_point
        writer.writerow(
            [
                w.code,
                hp.code if hp else "",
                hp.name if hp else "",
                LEVEL_DISPLAY.get(w.level, w.level),
                STATUS_DISPLAY.get(w.status, w.status),
                w.trigger_type,
                w.confidence,
                w.confirm_user,
                w.publish_user,
                w.close_reason,
                w.created_at,
                w.close_time,
            ]
        )

    def stream():
        yield buffer.getvalue().encode("utf-8-sig")

    return StreamingResponse(
        stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="warning_records.csv"'},
    )


@router.get("/{record_id}/")
def retrieve_record(
    record_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    return serialize_record(_get_record(db, record_id))


@router.delete("/{record_id}/")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    record = _get_record(db, record_id)
    if record.status != "closed":
        raise HTTPException(
            status_code=400, detail="仅已闭环预警可删除，请先闭环"
        )
    code = record.code
    db.delete(record)
    db.commit()
    return {"detail": f"已删除预警 {code}"}


@router.get("/{record_id}/related/")
def related(
    record_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    point = warning.hazard_point
    devices = (
        db.query(MonitoringDevice)
        .filter(MonitoringDevice.hazard_point_id == point.id)
        .order_by(desc(MonitoringDevice.last_data_time))
        .limit(20)
        .all()
    )
    device_rows = [
        {
            "id": d.id,
            "code": d.code,
            "name": d.name,
            "device_type": d.device_type,
            "status": d.status,
            "battery": d.battery,
            "last_data_time": d.last_data_time,
        }
        for d in devices
    ]
    latest_data = []
    for dev in devices[:8]:
        row = (
            db.query(MonitorData)
            .filter(MonitorData.device_id == dev.id)
            .order_by(desc(MonitorData.record_time))
            .first()
        )
        if row:
            latest_data.append(
                {
                    "device_id": row.device_id,
                    "data_type": row.data_type,
                    "value": float(row.value),
                    "unit": row.unit,
                    "record_time": row.record_time,
                }
            )
    evacuations = (
        db.query(EvacuationTask)
        .filter(EvacuationTask.hazard_point_id == point.id)
        .order_by(desc(EvacuationTask.created_at))
        .limit(5)
        .all()
    )
    return {
        "warning": serialize_record(warning),
        "hazard_point": {
            "id": point.id,
            "code": point.code,
            "name": point.name,
            "level": point.level,
            "status": point.status,
            "address": point.address,
            "town": point.town,
            "village": point.village,
            "threat_people": point.threat_people,
            "threat_houses": point.threat_houses,
            "responsible_person": point.responsible_person,
            "contact_phone": point.contact_phone,
        },
        "devices": device_rows,
        "latest_data": latest_data,
        "evacuations": [
            {
                "id": e.id,
                "code": e.code,
                "status": e.status,
                "total_people": e.total_people,
                "transferred_people": e.transferred_people,
                "shelter_name": e.shelter_name,
                "commander": e.commander,
                "grid_worker": e.grid_worker,
                "grid_phone": e.grid_phone,
                "commander_phone": e.commander_phone,
            }
            for e in evacuations
        ],
    }


@router.post("/{record_id}/confirm/")
def confirm(
    record_id: int,
    body: ConfirmBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"当前状态「{STATUS_DISPLAY.get(warning.status, warning.status)}」不可确认",
        )
    warning.status = "confirmed"
    warning.confirm_time = utcnow()
    warning.confirm_user = body.confirm_user.strip() or _actor_name(body.model_dump())
    warning.updated_at = utcnow()
    point = warning.hazard_point
    if point.status in ("stable", "attention"):
        point.status = "warning"
        point.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)


@router.post("/{record_id}/analyze/")
def analyze(
    record_id: int,
    body: AnalyzeBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status not in ("confirmed", "analyzing"):
        raise HTTPException(status_code=400, detail="请先确认预警后再研判")
    warning.status = "analyzing"
    detail = warning.call_detail if isinstance(warning.call_detail, dict) else {}
    detail["analyze"] = {
        "note": body.note,
        "conclusion": body.conclusion,
        "at": utcnow().isoformat(),
        "by": _actor_name(body.model_dump()),
    }
    warning.call_detail = detail
    warning.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)


@router.post("/{record_id}/publish/")
def publish(
    record_id: int,
    body: PublishBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status not in ("confirmed", "analyzing", "published"):
        raise HTTPException(status_code=400, detail="仅已确认/研判中的预警可发布")
    warning.status = "published"
    warning.publish_time = utcnow()
    warning.publish_user = body.publish_user.strip() or _actor_name(
        body.model_dump(), "publish_user"
    )
    warning.updated_at = utcnow()
    point = warning.hazard_point
    if warning.level in ("red", "orange"):
        point.status = "emergency" if warning.level == "red" else "warning"
        point.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)


@router.post("/{record_id}/call/")
def call(
    record_id: int,
    body: CallBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status == "closed":
        raise HTTPException(status_code=400, detail="已闭环预警不可叫应")
    point = warning.hazard_point
    targets = list(body.targets)
    if not targets:
        if point.contact_phone:
            targets.append(f"{point.responsible_person or '责任人'}:{point.contact_phone}")
        targets.extend(["值班领导:调度台", "网格员:村委会"])
    caller = body.caller.strip() or _actor_name(body.model_dump(), "caller")
    detail = warning.call_detail if isinstance(warning.call_detail, dict) else {}
    detail.update(
        {
            "caller": caller,
            "targets": targets,
            "called_at": utcnow().isoformat(),
            "result": "模拟叫应成功",
        }
    )
    warning.call_status = "success"
    warning.call_detail = detail
    if warning.status == "published":
        warning.status = "processing"
    warning.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)


@router.post("/{record_id}/process/")
def process(
    record_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status not in PROCESSING_STATUSES:
        raise HTTPException(status_code=400, detail="当前状态不可进入处置")
    warning.status = "processing"
    warning.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)


@router.post("/{record_id}/close/")
def close(
    record_id: int,
    body: CloseBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    warning = _get_record(db, record_id)
    if warning.status == "closed":
        raise HTTPException(status_code=400, detail="预警已闭环")
    warning.status = "closed"
    warning.close_time = utcnow()
    warning.close_reason = body.close_reason
    warning.updated_at = utcnow()
    point = warning.hazard_point
    still_open = (
        db.query(WarningRecord)
        .filter(
            WarningRecord.hazard_point_id == point.id,
            WarningRecord.status != "closed",
            WarningRecord.id != warning.id,
        )
        .count()
        > 0
    )
    if not still_open and point.status in ("warning", "emergency"):
        point.status = "attention"
        point.updated_at = utcnow()
    db.commit()
    db.refresh(warning)
    return serialize_record(warning)
