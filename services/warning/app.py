"""
Warning microservice — FastAPI + SQLAlchemy (no Django ORM).

Port WARNING_PORT (default 8002). Gateway routes /api/warning/* here.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure services/ and services/warning/ are importable.
_SERVICES_ROOT = Path(__file__).resolve().parents[1]
_WARNING_ROOT = Path(__file__).resolve().parent
for root in (_SERVICES_ROOT, _WARNING_ROOT):
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

import logging
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from common.config import INTERNAL_SERVICE_TOKEN, WARNING_PORT  # noqa: E402
from common.db import get_db  # noqa: E402
from engine import MonitorPayload, WarningEngine  # noqa: E402
from routers import models_router, records  # noqa: E402
from schemas import EvaluateBody  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("warning-service")

app = FastAPI(title="LandslideHazard Warning Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(records.router, prefix="/api/warning")
app.include_router(models_router.router, prefix="/api/warning")


def verify_internal_token(
    x_internal_token: str | None = Header(None, alias="X-Internal-Token"),
) -> None:
    if x_internal_token != INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:  # noqa: BLE001
        db_ok = False
        logger.warning("DB health check failed: %s", exc)
    return {"ok": db_ok, "service": "warning"}


@app.get("/internal/engine-threshold")
def internal_engine_threshold(
    data_type: str = "force",
    db: Session = Depends(get_db),
    _: None = Depends(verify_internal_token),
) -> dict[str, Any]:
    engine = WarningEngine(db)
    thresholds, meta = engine._get_thresholds_with_meta(data_type)
    return {"data_type": data_type, "thresholds": thresholds, "model": meta}


@app.post("/internal/evaluate")
def internal_evaluate(
    body: EvaluateBody,
    db: Session = Depends(get_db),
    _: None = Depends(verify_internal_token),
) -> dict[str, Any]:
    engine = WarningEngine(db)
    payload = MonitorPayload(
        device_id=body.device_id,
        device_code=body.device_code,
        device_name=body.device_name,
        hazard_point_id=body.hazard_point_id,
        data_type=body.data_type,
        channel=body.channel or "",
        value=body.value,
        unit=body.unit or "",
        record_time=body.record_time,
    )
    return engine.evaluate_from_payload(payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=WARNING_PORT, reload=True)
