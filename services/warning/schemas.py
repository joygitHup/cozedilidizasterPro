"""Pydantic schemas and display maps."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

LEVEL_DISPLAY = {
    "red": "红色",
    "orange": "橙色",
    "yellow": "黄色",
    "blue": "蓝色",
}

STATUS_DISPLAY = {
    "pending": "待确认",
    "confirmed": "已确认",
    "analyzing": "研判中",
    "published": "已发布",
    "processing": "处置中",
    "closed": "已闭环",
}

MODEL_TYPE_DISPLAY = {
    "threshold": "阈值模型",
    "trend": "趋势模型",
    "ml": "机器学习模型",
    "fusion": "融合模型",
}

DT_FORMAT = "%Y-%m-%d %H:%M:%S"


def fmt_dt(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime(DT_FORMAT)


class ConfirmBody(BaseModel):
    confirm_user: str = ""
    note: str = ""


class AnalyzeBody(BaseModel):
    note: str = ""
    conclusion: str = ""


class PublishBody(BaseModel):
    publish_user: str = ""
    note: str = ""


class CloseBody(BaseModel):
    close_reason: str = Field(..., max_length=200)


class CallBody(BaseModel):
    caller: str = ""
    targets: list[str] = Field(default_factory=list)


class ModelTestBody(BaseModel):
    data_type: str = "force"
    value: float


class LoopDemoBody(BaseModel):
    device_code: str | None = None
    data_type: str | None = None
    value: float | None = None
    unit: str | None = None
    channel: str | None = None


class ActivateBody(BaseModel):
    exclusive: bool = True


class EvaluateBody(BaseModel):
    device_id: int
    device_code: str
    device_name: str = ""
    hazard_point_id: int | None = None
    data_type: str
    channel: str = ""
    value: float
    unit: str = ""
    record_time: datetime | None = None


class WarningModelWrite(BaseModel):
    code: str = ""
    name: str
    model_type: str
    description: str = ""
    params: dict[str, Any] = Field(default_factory=dict)
    yellow_threshold: float = 0
    orange_threshold: float = 0
    red_threshold: float = 0
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return (value or "").strip().upper()


class WarningModelPatch(BaseModel):
    code: str | None = None
    name: str | None = None
    model_type: str | None = None
    description: str | None = None
    params: dict[str, Any] | None = None
    yellow_threshold: float | None = None
    orange_threshold: float | None = None
    red_threshold: float | None = None
    is_active: bool | None = None


def build_timeline(record: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = [
        {
            "time": fmt_dt(record.created_at),
            "event": "预警触发",
            "actor": "规则引擎",
            "status": "completed",
        }
    ]
    if record.confirm_time:
        events.append(
            {
                "time": fmt_dt(record.confirm_time),
                "event": "值班确认",
                "actor": record.confirm_user or "",
                "status": "completed",
            }
        )
    if record.status == "analyzing" or (
        record.status in ("published", "processing", "closed") and record.confirm_time
    ):
        if record.status == "analyzing":
            events.append(
                {
                    "time": fmt_dt(record.updated_at),
                    "event": "会商研判",
                    "actor": "",
                    "status": "current",
                }
            )
        elif record.confirm_time:
            events.append(
                {
                    "time": fmt_dt(record.confirm_time),
                    "event": "会商研判",
                    "actor": "",
                    "status": "completed",
                }
            )
    if record.publish_time:
        events.append(
            {
                "time": fmt_dt(record.publish_time),
                "event": "发布预警",
                "actor": record.publish_user or "",
                "status": "completed",
            }
        )
    call_detail = record.call_detail if isinstance(record.call_detail, dict) else {}
    if record.call_status in ("success", "failed", "timeout") and call_detail:
        events.append(
            {
                "time": call_detail.get("called_at") or fmt_dt(record.updated_at),
                "event": f"一键叫应({record.call_status})",
                "actor": call_detail.get("caller", ""),
                "status": "completed",
            }
        )
    if record.close_time:
        events.append(
            {
                "time": fmt_dt(record.close_time),
                "event": (
                    f"闭环归档：{record.close_reason}"
                    if record.close_reason
                    else "闭环归档"
                ),
                "actor": "",
                "status": "completed",
            }
        )
    else:
        open_steps = {
            "pending": "待确认",
            "confirmed": "待研判/发布",
            "analyzing": "研判中",
            "published": "已发布待处置",
            "processing": "处置中",
        }
        if record.status in open_steps and not any(
            e.get("status") == "current" for e in events
        ):
            events.append(
                {
                    "time": fmt_dt(record.updated_at),
                    "event": open_steps[record.status],
                    "actor": "",
                    "status": "current",
                }
            )
    return events


def serialize_record(record: Any, *, include_timeline: bool = True) -> dict[str, Any]:
    hazard = getattr(record, "hazard_point", None)
    data: dict[str, Any] = {
        "id": record.id,
        "code": record.code,
        "hazard_point": record.hazard_point_id,
        "hazard_point_id": record.hazard_point_id,
        "hazard_name": hazard.name if hazard else "",
        "hazard_code": hazard.code if hazard else "",
        "level": record.level,
        "level_display": LEVEL_DISPLAY.get(record.level, record.level),
        "trigger_type": record.trigger_type,
        "trigger_value": record.trigger_value or {},
        "confidence": float(record.confidence or 0),
        "status": record.status,
        "status_display": STATUS_DISPLAY.get(record.status, record.status),
        "call_status": record.call_status or "",
        "call_detail": record.call_detail or {},
        "confirm_time": fmt_dt(record.confirm_time),
        "confirm_user": record.confirm_user or "",
        "publish_time": fmt_dt(record.publish_time),
        "publish_user": record.publish_user or "",
        "close_time": fmt_dt(record.close_time),
        "close_reason": record.close_reason or "",
        "created_at": fmt_dt(record.created_at),
        "updated_at": fmt_dt(record.updated_at),
    }
    if include_timeline:
        data["timeline"] = build_timeline(record)
    return data


def serialize_record_list(record: Any) -> dict[str, Any]:
    hazard = getattr(record, "hazard_point", None)
    return {
        "id": record.id,
        "code": record.code,
        "hazard_point": record.hazard_point_id,
        "hazard_name": hazard.name if hazard else "",
        "hazard_code": hazard.code if hazard else "",
        "level": record.level,
        "level_display": LEVEL_DISPLAY.get(record.level, record.level),
        "status": record.status,
        "status_display": STATUS_DISPLAY.get(record.status, record.status),
        "trigger_type": record.trigger_type,
        "confidence": float(record.confidence or 0),
        "call_status": record.call_status or "",
        "created_at": fmt_dt(record.created_at),
        "confirm_time": fmt_dt(record.confirm_time),
        "publish_time": fmt_dt(record.publish_time),
        "close_time": fmt_dt(record.close_time),
        "updated_at": fmt_dt(record.updated_at),
    }


def threshold_summary(model: Any) -> str:
    summary = (
        f"黄{model.yellow_threshold}/橙{model.orange_threshold}/红{model.red_threshold}"
    )
    params = model.params or {}
    typed = [
        k
        for k, v in params.items()
        if k
        not in (
            "accuracy",
            "thresholds",
            "weights",
            "window_hours",
            "accel_yellow",
            "accel_orange",
            "accel_red",
        )
        and isinstance(v, dict)
    ]
    if typed:
        summary += f" | 专用:{','.join(typed)}"
    return summary


def is_primary_model(model: Any, primary_id: int | None) -> bool:
    return bool(
        model.is_active and model.model_type == "threshold" and primary_id == model.id
    )


def serialize_model(
    model: Any,
    *,
    primary_id: int | None = None,
    avg_confidence: float | None = None,
) -> dict[str, Any]:
    params = model.params or {}
    accuracy = None
    if params.get("accuracy") is not None:
        try:
            accuracy = float(params["accuracy"])
        except (TypeError, ValueError):
            accuracy = None
    elif avg_confidence is not None:
        accuracy = avg_confidence

    return {
        "id": model.id,
        "code": model.code,
        "name": model.name,
        "model_type": model.model_type,
        "model_type_display": MODEL_TYPE_DISPLAY.get(model.model_type, model.model_type),
        "description": model.description or "",
        "params": params,
        "yellow_threshold": float(model.yellow_threshold or 0),
        "orange_threshold": float(model.orange_threshold or 0),
        "red_threshold": float(model.red_threshold or 0),
        "threshold_summary": threshold_summary(model),
        "accuracy": accuracy,
        "is_primary": is_primary_model(model, primary_id),
        "is_active": model.is_active,
        "created_at": fmt_dt(model.created_at),
        "updated_at": fmt_dt(model.updated_at),
    }


def next_model_code(db, model_type: str = "threshold") -> str:
    from sqlalchemy import desc

    from models import WarningModel

    prefix_map = {
        "threshold": "THRESH",
        "trend": "TREND",
        "ml": "ML",
        "fusion": "FUSION",
    }
    prefix = prefix_map.get(model_type, "MODEL")
    existing = (
        db.query(WarningModel.code)
        .filter(WarningModel.code.like(f"{prefix}-%"))
        .order_by(desc(WarningModel.code))
        .all()
    )
    max_n = 0
    for (code,) in existing:
        suffix = code.split("-")[-1]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    if (
        db.query(WarningModel).filter(WarningModel.code.like(f"{prefix}%")).count() > 0
        and max_n == 0
    ):
        max_n = db.query(WarningModel).filter(WarningModel.code.like(f"{prefix}%")).count()
    return f"{prefix}-{max_n + 1:03d}"
