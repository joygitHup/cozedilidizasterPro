"""Warning model configuration API routes."""
from __future__ import annotations

import csv
import io
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from common.auth import get_current_user
from common.db import get_db
from common.pagination import paginate_query
from engine import DEFAULT_THRESHOLDS, WarningEngine, utcnow
from models import MonitoringDevice, WarningModel, WarningRecord
from schemas import (
    LEVEL_DISPLAY,
    MODEL_TYPE_DISPLAY,
    ActivateBody,
    LoopDemoBody,
    ModelTestBody,
    WarningModelPatch,
    WarningModelWrite,
    next_model_code,
    serialize_model,
)

router = APIRouter(prefix="/models", tags=["warning-models"])


def _primary_threshold_id(db: Session) -> int | None:
    return (
        db.query(WarningModel.id)
        .filter(WarningModel.is_active.is_(True), WarningModel.model_type == "threshold")
        .order_by(desc(WarningModel.updated_at))
        .limit(1)
        .scalar()
    )


def _avg_confidence(db: Session) -> float | None:
    since = utcnow() - timedelta(days=30)
    avg = (
        db.query(func.avg(WarningRecord.confidence))
        .filter(WarningRecord.created_at >= since)
        .scalar()
    )
    return round(float(avg), 1) if avg is not None else None


def _validate_thresholds(yellow: float, orange: float, red: float) -> None:
    if not (0 <= yellow <= orange <= red):
        raise HTTPException(status_code=400, detail="阈值须满足：0 ≤ 黄色 ≤ 橙色 ≤ 红色")


def _validate_params(params: dict[str, Any]) -> None:
    if not isinstance(params, dict):
        raise HTTPException(status_code=400, detail="参数须为 JSON 对象")
    for key, conf in params.items():
        if key in ("accuracy", "unit", "note"):
            continue
        if isinstance(conf, dict):
            vals = []
            for level in ("yellow", "orange", "red"):
                if level in conf and conf[level] is not None:
                    try:
                        vals.append(float(conf[level]))
                    except (TypeError, ValueError):
                        raise HTTPException(
                            status_code=400, detail=f"params.{key}.{level} 须为数字"
                        )
            if vals and sorted(vals) != vals:
                raise HTTPException(
                    status_code=400, detail=f"params.{key} 黄/橙/红阈值须递增"
                )


def _ensure_single_active_threshold(db: Session, model: WarningModel) -> None:
    if model.is_active and model.model_type == "threshold":
        db.query(WarningModel).filter(
            WarningModel.is_active.is_(True),
            WarningModel.model_type == "threshold",
            WarningModel.id != model.id,
        ).update({"is_active": False, "updated_at": utcnow()}, synchronize_session=False)


def _get_model(db: Session, model_id: int) -> WarningModel:
    model = db.get(WarningModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="未找到预警模型")
    return model


def _serialize(db: Session, model: WarningModel) -> dict[str, Any]:
    return serialize_model(
        model,
        primary_id=_primary_threshold_id(db),
        avg_confidence=_avg_confidence(db),
    )


@router.get("/")
def list_models(
    request: Request,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, alias="page_size"),
    model_type: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    ordering: str | None = None,
):
    query = db.query(WarningModel).order_by(
        desc(WarningModel.is_active), desc(WarningModel.updated_at), desc(WarningModel.id)
    )
    if model_type:
        query = query.filter(WarningModel.model_type == model_type)
    if is_active is not None:
        query = query.filter(WarningModel.is_active.is_(is_active))
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                WarningModel.name.ilike(like),
                WarningModel.code.ilike(like),
                WarningModel.description.ilike(like),
            )
        )
    if ordering:
        desc_flag = ordering.startswith("-")
        field = ordering.lstrip("-")
        column = getattr(WarningModel, field, None)
        if column is not None:
            query = query.order_by(desc(column) if desc_flag else column.asc())
    primary_id = _primary_threshold_id(db)
    avg_conf = _avg_confidence(db)
    return paginate_query(
        request,
        query,
        page=page,
        page_size=page_size,
        serializer=lambda m: serialize_model(m, primary_id=primary_id, avg_confidence=avg_conf),
    )


@router.get("/statistics/")
def statistics(
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    qs = db.query(WarningModel)
    return {
        "total": qs.count(),
        "active": qs.filter(WarningModel.is_active.is_(True)).count(),
        "inactive": qs.filter(WarningModel.is_active.is_(False)).count(),
        "by_type": {
            t: qs.filter(WarningModel.model_type == t).count()
            for t in MODEL_TYPE_DISPLAY
        },
        "primary_threshold_id": _primary_threshold_id(db),
        "engine_resolve_hint": (
            "启用模型中：带 data_type 专用 params 者优先；"
            "启用 THRESH-RAIN 时请用 activate?exclusive=1 避免与默认模型并存误解"
        ),
    }


@router.get("/next_code/")
def next_code(
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    model_type: str = Query("threshold"),
):
    return {"code": next_model_code(db, model_type)}


@router.get("/export/")
def export_models(
    request: Request,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
    model_type: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
):
    query = db.query(WarningModel).order_by(
        desc(WarningModel.is_active), desc(WarningModel.updated_at)
    )
    if model_type:
        query = query.filter(WarningModel.model_type == model_type)
    if is_active is not None:
        query = query.filter(WarningModel.is_active.is_(is_active))
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                WarningModel.name.ilike(like),
                WarningModel.code.ilike(like),
                WarningModel.description.ilike(like),
            )
        )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["编号", "名称", "类型", "黄色阈值", "橙色阈值", "红色阈值", "启用", "描述", "更新时间"]
    )
    for m in query.all():
        writer.writerow(
            [
                m.code,
                m.name,
                MODEL_TYPE_DISPLAY.get(m.model_type, m.model_type),
                m.yellow_threshold,
                m.orange_threshold,
                m.red_threshold,
                "是" if m.is_active else "否",
                m.description,
                m.updated_at,
            ]
        )

    def stream():
        yield buffer.getvalue().encode("utf-8-sig")

    return StreamingResponse(
        stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="warning_models.csv"'},
    )


@router.post("/")
def create_model(
    body: WarningModelWrite,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    _validate_thresholds(body.yellow_threshold, body.orange_threshold, body.red_threshold)
    _validate_params(body.params)
    code = body.code.strip() or next_model_code(db, body.model_type)
    if code and db.query(WarningModel).filter(WarningModel.code == code).first():
        raise HTTPException(status_code=400, detail="模型编号已存在")
    now = utcnow()
    model = WarningModel(
        code=code,
        name=body.name.strip(),
        model_type=body.model_type,
        description=body.description,
        params=body.params,
        yellow_threshold=body.yellow_threshold,
        orange_threshold=body.orange_threshold,
        red_threshold=body.red_threshold,
        is_active=body.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    _ensure_single_active_threshold(db, model)
    db.commit()
    db.refresh(model)
    return _serialize(db, model)


@router.get("/{model_id}/")
def retrieve_model(
    model_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    return _serialize(db, _get_model(db, model_id))


@router.put("/{model_id}/")
@router.patch("/{model_id}/")
def update_model(
    model_id: int,
    body: WarningModelPatch,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    if "code" in data and data["code"]:
        data["code"] = data["code"].strip().upper()
        exists = (
            db.query(WarningModel)
            .filter(WarningModel.code == data["code"], WarningModel.id != model.id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="模型编号已存在")
    yellow = float(data.get("yellow_threshold", model.yellow_threshold))
    orange = float(data.get("orange_threshold", model.orange_threshold))
    red = float(data.get("red_threshold", model.red_threshold))
    _validate_thresholds(yellow, orange, red)
    if "params" in data:
        _validate_params(data["params"])
    for key, value in data.items():
        setattr(model, key, value)
    model.updated_at = utcnow()
    db.commit()
    db.refresh(model)
    _ensure_single_active_threshold(db, model)
    db.commit()
    db.refresh(model)
    return _serialize(db, model)


@router.delete("/{model_id}/")
def delete_model(
    model_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    if model.is_active and model.model_type == "threshold":
        others = (
            db.query(WarningModel)
            .filter(
                WarningModel.is_active.is_(True),
                WarningModel.model_type == "threshold",
                WarningModel.id != model.id,
            )
            .count()
            > 0
        )
        if not others:
            raise HTTPException(
                status_code=400,
                detail="不能删除唯一启用的阈值模型，请先启用其他模型或停用本模型",
            )
    code = model.code
    db.delete(model)
    db.commit()
    return {"detail": f"已删除模型 {code}"}


@router.post("/{model_id}/activate/")
def activate(
    model_id: int,
    body: ActivateBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    exclusive = body.exclusive
    model.is_active = True
    model.updated_at = utcnow()
    deactivated: list[str] = []
    if exclusive and model.model_type == "threshold":
        others = db.query(WarningModel).filter(
            WarningModel.is_active.is_(True),
            WarningModel.model_type == "threshold",
            WarningModel.id != model.id,
        )
        deactivated = [code for (code,) in others.with_entities(WarningModel.code).all()]
        others.update({"is_active": False, "updated_at": utcnow()}, synchronize_session=False)
    db.commit()
    db.refresh(model)
    data = _serialize(db, model)
    data["deactivated"] = deactivated
    return data


@router.post("/{model_id}/deactivate/")
def deactivate(
    model_id: int,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    if model.is_active and model.model_type == "threshold":
        others = (
            db.query(WarningModel)
            .filter(
                WarningModel.is_active.is_(True),
                WarningModel.model_type == "threshold",
                WarningModel.id != model.id,
            )
            .count()
            > 0
        )
        if not others:
            raise HTTPException(
                status_code=400,
                detail="至少保留一个启用的阈值模型，供监测预警引擎使用",
            )
    model.is_active = False
    model.updated_at = utcnow()
    db.commit()
    db.refresh(model)
    return _serialize(db, model)


@router.post("/{model_id}/test/")
def test_model(
    model_id: int,
    body: ModelTestBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    base = dict(DEFAULT_THRESHOLDS.get(body.data_type, {}))
    type_params = (model.params or {}).get(body.data_type)
    if isinstance(type_params, dict) and type_params:
        base.update({k: float(v) for k, v in type_params.items() if v is not None})
    else:
        base.update(
            {
                "yellow": float(model.yellow_threshold),
                "orange": float(model.orange_threshold),
                "red": float(model.red_threshold),
            }
        )
    value = float(body.value)
    level = None
    if value >= float(base.get("red", 1e18)):
        level = "red"
    elif value >= float(base.get("orange", 1e18)):
        level = "orange"
    elif value >= float(base.get("yellow", 1e18)):
        level = "yellow"
    return {
        "model_id": model.id,
        "model_code": model.code,
        "data_type": body.data_type,
        "value": value,
        "thresholds": {
            "yellow": float(base.get("yellow", 0)),
            "orange": float(base.get("orange", 0)),
            "red": float(base.get("red", 0)),
        },
        "level": level,
        "triggered": level is not None,
        "message": (
            f"将触发{LEVEL_DISPLAY.get(level, level)}预警"
            if level
            else "未达阈值，不会建单"
        ),
        "engine_primary": _serialize(db, model)["is_primary"],
    }


@router.post("/{model_id}/loop_demo/")
def loop_demo(
    model_id: int,
    body: LoopDemoBody,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    model = _get_model(db, model_id)
    if model.model_type != "threshold":
        raise HTTPException(
            status_code=400,
            detail=(
                f"{MODEL_TYPE_DISPLAY.get(model.model_type, model.model_type)}"
                "不参与监测上报自动建单；请选用阈值模型跑闭环"
            ),
        )

    model.is_active = True
    model.updated_at = utcnow()
    db.query(WarningModel).filter(
        WarningModel.is_active.is_(True),
        WarningModel.model_type == "threshold",
        WarningModel.id != model.id,
    ).update({"is_active": False, "updated_at": utcnow()}, synchronize_session=False)
    db.commit()

    presets = {
        "THRESH-RAIN": {
            "device_code": "RAIN-001",
            "data_type": "rainfall",
            "value": 65,
            "unit": "mm",
        },
        "THRESH-NPR": {
            "device_code": "NPR-001",
            "data_type": "force",
            "value": 88,
            "unit": "kN",
        },
        "THRESH-FIBER": {
            "device_code": "FIB-001",
            "data_type": "strain",
            "value": 650,
            "unit": "με",
        },
        "THRESH-DISP": {
            "device_code": "GNSS-001",
            "data_type": "displacement",
            "channel": "H",
            "value": 16,
            "unit": "mm",
        },
        "THRESH-TEMP": {
            "device_code": "CAM-001",
            "data_type": "temperature",
            "value": 56,
            "unit": "℃",
        },
        "THRESH-DEFAULT": {
            "device_code": "RAIN-001",
            "data_type": "rainfall",
            "value": 55,
            "unit": "mm",
        },
    }
    payload = dict(
        presets.get(model.code)
        or {
            "device_code": "RAIN-001",
            "data_type": "rainfall",
            "value": 55,
            "unit": "mm",
        }
    )
    for key in ("device_code", "data_type", "value", "unit", "channel"):
        val = getattr(body, key, None)
        if val not in (None, ""):
            payload[key] = val

    device = (
        db.query(MonitoringDevice)
        .filter(MonitoringDevice.code == payload["device_code"])
        .first()
    )
    if device is None:
        raise HTTPException(
            status_code=404,
            detail=f"设备不存在: {payload['device_code']}，请先初始化设备台账",
        )
    if not device.hazard_point_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"设备 {device.code} 未关联隐患点，超阈不会建预警单；"
                "请先在监测设备中绑定隐患点"
            ),
        )

    from engine import MonitorPayload

    engine = WarningEngine(db)
    hit = engine.evaluate_from_payload(
        MonitorPayload(
            device_id=device.id,
            device_code=device.code,
            device_name=device.name,
            hazard_point_id=device.hazard_point_id,
            data_type=str(payload["data_type"]),
            channel=str(payload.get("channel") or ""),
            value=float(payload["value"]),
            unit=str(payload.get("unit") or ""),
        )
    )
    warning_id = hit.get("warning_id")
    warning_code = hit.get("warning_code")
    return {
        "ok": True,
        "step": {
            "1_activate": model.code,
            "2_ingest": payload,
            "3_engine": hit,
            "4_dispose": "/warning/current",
        },
        "model_code": model.code,
        "trace_id": f"demo-{model.code}",
        "ingest": {"warnings": [hit], "ok": True},
        "warning_id": warning_id,
        "warning_code": warning_code,
        "renewed": hit.get("renewed"),
        "created": hit.get("created"),
        "message": (
            f"已启用 {model.code} 并上报 {payload['device_code']} "
            f"{payload['data_type']}={payload['value']}；"
            + (
                f"预警单 {(warning_code or warning_id)}，请前往实时预警处置"
                if warning_id
                else (
                    "已触发但被去重续报"
                    if hit.get("renewed")
                    else "未建单，请查看 warnings 详情"
                )
            )
        ),
    }
