"""FastAPI Monitor microservice — pure SQLAlchemy, no Django ORM."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure `services/` and `services/monitor/` are importable
_SERVICES = Path(__file__).resolve().parent.parent
_MONITOR = Path(__file__).resolve().parent
for _p in (str(_SERVICES), str(_MONITOR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import os

os.environ.setdefault("SERVICE_DB_PREFIX", "MONITOR")

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from common.config import monitor_port
from routers import data, devices, ingest

app = FastAPI(title="Monitor Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix="/api/monitoring")
app.include_router(data.router, prefix="/api/monitoring")
app.include_router(ingest.router, prefix="/api/monitoring")


@app.get("/health")
def health():
    return {"status": "ok", "service": "monitor"}


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=monitor_port(),
        reload=True,
    )
