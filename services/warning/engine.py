"""Threshold rule engine (SQLAlchemy port of backend/warning/engines/rule_engine.py)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from common.redis_client import RedisCache
from models import HazardPoint, MonitorData, MonitoringDevice, WarningModel, WarningRecord

logger = logging.getLogger(__name__)

LEVEL_PRIORITY = {"blue": 1, "yellow": 2, "orange": 3, "red": 4}

DEFAULT_THRESHOLDS = {
    "force": {"yellow": 50, "orange": 70, "red": 85, "change_rate_red": 30},
    "rainfall": {"yellow": 30, "orange": 50, "red": 80},
    "displacement": {"yellow": 5, "orange": 10, "red": 20},
    "stress": {"yellow": 40, "orange": 60, "red": 80},
    "strain": {"yellow": 200, "orange": 400, "red": 600},
    "temperature": {"yellow": 40, "orange": 50, "red": 60},
}

TRIGGER_LABELS = {
    "force": "牛顿力超阈值",
    "force_drop": "牛顿力突降",
    "rainfall": "降雨量预警",
    "displacement": "位移超阈值",
    "stress": "应力超阈值",
    "strain": "应变超阈值",
    "temperature": "温度超阈值",
}

UNLINKED_ALERT_TTL = 6 * 3600
UNLINKED_ALERT_KEY = "iot:alert:unlinked:{code}"

OPEN_STATUSES = ("pending", "confirmed", "analyzing", "published", "processing")


@dataclass
class MonitorPayload:
    device_id: int
    device_code: str
    device_name: str
    hazard_point_id: int | None
    data_type: str
    channel: str
    value: float
    unit: str
    record_time: datetime | None = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class WarningEngine:
    DEDUP_HOURS = 6

    def __init__(self, db: Session, cache: RedisCache | None = None):
        self.db = db
        self.cache = cache or RedisCache()

    def evaluate_from_payload(self, payload: MonitorPayload) -> dict[str, Any]:
        device = self.db.get(MonitoringDevice, payload.device_id)
        if device is None:
            device = MonitoringDevice(
                id=payload.device_id,
                code=payload.device_code,
                name=payload.device_name or payload.device_code,
                device_type="others",
            )
        hazard = None
        hp_id = payload.hazard_point_id or getattr(device, "hazard_point_id", None)
        if hp_id:
            hazard = self.db.get(HazardPoint, hp_id)
        return self._evaluate(
            device=device,
            hazard=hazard,
            data_type=payload.data_type,
            value=float(payload.value),
            channel=(payload.channel or "").strip().upper(),
            unit=payload.unit or "",
        )

    def _evaluate(
        self,
        *,
        device: MonitoringDevice,
        hazard: HazardPoint | None,
        data_type: str,
        value: float,
        channel: str,
        unit: str,
    ) -> dict[str, Any]:
        thresholds, model_meta = self._get_thresholds_with_meta(data_type)

        if data_type == "displacement" and channel and channel not in ("H",):
            return {
                "triggered": False,
                "reason": f"分轴通道 {channel} 仅入库，预警以合位移通道 H 为准",
                "channel": channel,
                "model_code": model_meta.get("code"),
                "thresholds": thresholds,
            }

        alerts: list[dict[str, Any]] = []
        if data_type == "force":
            change_rate = self._force_change_rate(device.id, value)
            drop_threshold = thresholds.get("change_rate_red", 30)
            if change_rate is not None and change_rate > drop_threshold:
                alerts.append(
                    {
                        "type": "force_drop",
                        "level": "red",
                        "value": value,
                        "change_rate": round(change_rate, 2),
                        "confidence": 90.0,
                    }
                )

        level = self._level_by_value(value, thresholds)
        if level:
            alerts.append(
                {
                    "type": data_type,
                    "level": level,
                    "value": value,
                    "confidence": self._confidence_for_level(level),
                }
            )

        if not alerts:
            self._clear_unlinked_alert(device.code)
            return {
                "triggered": False,
                "reason": "未达阈值",
                "model_code": model_meta.get("code"),
                "model_name": model_meta.get("name"),
                "thresholds": thresholds,
            }

        best = max(alerts, key=lambda a: LEVEL_PRIORITY.get(a["level"], 0))
        trigger_value = {
            "data_type": data_type,
            "channel": channel,
            "value": value,
            "unit": unit,
            "device_id": device.id,
            "device_code": device.code,
            "model_code": model_meta.get("code"),
            "model_name": model_meta.get("name"),
            "thresholds": thresholds,
            **{k: v for k, v in best.items() if k not in ("type", "level", "confidence")},
        }

        if not hazard:
            alert = {
                "type": "unlinked_hazard",
                "device_code": device.code,
                "device_name": device.name,
                "level": best["level"],
                "data_type": data_type,
                "value": value,
                "unit": unit,
                "model_code": model_meta.get("code"),
                "message": "监测值已超阈，但设备未关联隐患点，无法生成预警单",
                "at": utcnow().isoformat(),
            }
            self.cache.set(
                UNLINKED_ALERT_KEY.format(code=device.code), alert, timeout=UNLINKED_ALERT_TTL
            )
            self._push_ops_alert(alert)
            logger.warning(
                "超阈但未绑隐患点: device=%s level=%s value=%s model=%s",
                device.code,
                best["level"],
                value,
                model_meta.get("code"),
            )
            return {
                "triggered": False,
                "would_trigger": True,
                "blocked": "unlinked_hazard",
                "reason": "设备未关联隐患点",
                "level": best["level"],
                "model_code": model_meta.get("code"),
                "model_name": model_meta.get("name"),
                "thresholds": thresholds,
                "ops_alert": alert,
            }

        result = {
            "triggered": True,
            "level": best["level"],
            "trigger_type": best["type"],
            "trigger_value": trigger_value,
            "confidence": best.get("confidence", 60.0),
            "hazard_point_id": hazard.id,
            "alerts": alerts,
            "model_code": model_meta.get("code"),
            "model_name": model_meta.get("name"),
            "thresholds": thresholds,
        }

        record, action = self._create_or_renew_warning(hazard, result)
        result["warning_id"] = record.id if record else None
        result["warning_code"] = record.code if record else None
        result["deduplicated"] = action == "skipped"
        result["renewed"] = action == "renewed"
        result["created"] = action == "created"
        self._clear_unlinked_alert(device.code)
        return result

    def resolve_threshold_model(self, data_type: str) -> WarningModel | None:
        qs = (
            self.db.query(WarningModel)
            .filter(WarningModel.is_active.is_(True), WarningModel.model_type == "threshold")
            .order_by(desc(WarningModel.updated_at))
            .all()
        )
        if not qs:
            return None
        typed: list[WarningModel] = []
        for model in qs:
            params = model.params or {}
            type_params = params.get(data_type) or (params.get("thresholds") or {}).get(
                data_type
            )
            if isinstance(type_params, dict) and type_params:
                typed.append(model)
        if typed:
            return typed[0]
        return qs[0]

    def _get_thresholds_with_meta(
        self, data_type: str
    ) -> tuple[dict[str, float], dict[str, Any]]:
        base = dict(
            DEFAULT_THRESHOLDS.get(data_type, {"yellow": 50, "orange": 70, "red": 85})
        )
        model = self.resolve_threshold_model(data_type)
        meta: dict[str, Any] = {"code": None, "name": None, "id": None}
        if not model:
            meta["code"] = "BUILTIN-DEFAULT"
            meta["name"] = "内置默认阈值"
            return base, meta

        meta = {"code": model.code, "name": model.name, "id": model.id}
        params = model.params or {}
        type_params = params.get(data_type) or (params.get("thresholds") or {}).get(
            data_type
        )
        if isinstance(type_params, dict) and type_params:
            base.update({k: float(v) for k, v in type_params.items() if v is not None})
        else:
            base.update(
                {
                    "yellow": float(model.yellow_threshold or base.get("yellow", 0)),
                    "orange": float(model.orange_threshold or base.get("orange", 0)),
                    "red": float(model.red_threshold or base.get("red", 0)),
                }
            )
        return base, meta

    def _level_by_value(self, value: float, thresholds: dict[str, float]) -> str | None:
        red = float(thresholds.get("red", 999999))
        orange = float(thresholds.get("orange", 999999))
        yellow = float(thresholds.get("yellow", 999999))
        if value >= red:
            return "red"
        if value >= orange:
            return "orange"
        if value >= yellow:
            return "yellow"
        return None

    def _confidence_for_level(self, level: str) -> float:
        return {"red": 90.0, "orange": 75.0, "yellow": 60.0, "blue": 45.0}.get(level, 50.0)

    def _force_change_rate(self, device_id: int, current_value: float) -> float | None:
        records = (
            self.db.query(MonitorData)
            .filter(MonitorData.device_id == device_id, MonitorData.data_type == "force")
            .order_by(desc(MonitorData.record_time))
            .limit(2)
            .all()
        )
        if len(records) < 2:
            return None
        previous = float(records[1].value)
        if previous == 0:
            return None
        drop = (previous - current_value) / abs(previous) * 100
        return drop if drop > 0 else None

    def _clear_unlinked_alert(self, device_code: str) -> None:
        self.cache.delete(UNLINKED_ALERT_KEY.format(code=device_code))

    def _push_ops_alert(self, alert: dict) -> None:
        key = "iot:ops_alerts"
        try:
            items = self.cache.get(key) or []
            if not isinstance(items, list):
                items = []
            items = [
                a
                for a in items
                if not (
                    a.get("type") == alert.get("type")
                    and a.get("device_code") == alert.get("device_code")
                )
            ]
            items.insert(0, alert)
            self.cache.set(key, items[:100], timeout=7 * 24 * 3600)
        except Exception:  # noqa: BLE001
            pass

    def _create_or_renew_warning(
        self, hazard: HazardPoint, result: dict[str, Any]
    ) -> tuple[WarningRecord | None, str]:
        since = utcnow() - timedelta(hours=self.DEDUP_HOURS)
        new_level = result["level"]
        new_pri = LEVEL_PRIORITY.get(new_level, 0)

        open_qs = (
            self.db.query(WarningRecord)
            .filter(
                WarningRecord.hazard_point_id == hazard.id,
                WarningRecord.status.in_(OPEN_STATUSES),
                WarningRecord.created_at >= since,
            )
            .order_by(desc(WarningRecord.created_at))
            .all()
        )

        same_level = next((w for w in open_qs if w.level == new_level), None)
        if same_level:
            detail = same_level.call_detail if isinstance(same_level.call_detail, dict) else {}
            renew_count = int(detail.get("renew_count") or 0) + 1
            detail.update(
                {
                    "auto": True,
                    "renew_count": renew_count,
                    "last_renew_at": utcnow().isoformat(),
                    "message": f"规则引擎续报第{renew_count}次（同级去重窗口内）",
                }
            )
            same_level.trigger_value = result["trigger_value"]
            same_level.confidence = Decimal(str(round(result["confidence"], 2)))
            same_level.call_detail = detail
            same_level.updated_at = utcnow()
            self.db.commit()
            self.db.refresh(same_level)
            logger.info(
                "预警续报: %s hazard=%s level=%s renew=%s",
                same_level.code,
                hazard.code,
                new_level,
                renew_count,
            )
            return same_level, "renewed"

        higher = [w for w in open_qs if LEVEL_PRIORITY.get(w.level, 0) > new_pri]
        if higher:
            logger.info(
                "跳过较低级预警: hazard=%s level=%s higher=%s",
                hazard.code,
                new_level,
                higher[0].code,
            )
            return None, "skipped"

        code = self._next_warning_code()
        trigger_type = TRIGGER_LABELS.get(result["trigger_type"], result["trigger_type"])
        now = utcnow()
        record = WarningRecord(
            code=code,
            hazard_point_id=hazard.id,
            level=new_level,
            trigger_type=trigger_type,
            trigger_value=result["trigger_value"],
            confidence=Decimal(str(round(result["confidence"], 2))),
            status="pending",
            call_status="pending",
            call_detail={
                "auto": True,
                "renew_count": 0,
                "message": "规则引擎自动触发",
                "model_code": result.get("model_code"),
            },
            created_at=now,
            updated_at=now,
        )
        self.db.add(record)
        if new_level in ("red", "orange") and hazard.status in ("stable", "attention"):
            hazard.status = "warning"
            hazard.updated_at = now
        self.db.commit()
        self.db.refresh(record)
        logger.info(
            "预警触发: %s %s %s model=%s",
            record.code,
            hazard.name,
            record.level,
            result.get("model_code"),
        )
        return record, "created"

    def _next_warning_code(self) -> str:
        prefix = f"W{utcnow().strftime('%Y%m%d%H%M')}"
        count = (
            self.db.query(WarningRecord)
            .filter(WarningRecord.code.like(f"{prefix[:9]}%"))
            .count()
            + 1
        )
        return f"{prefix}{count:03d}"
