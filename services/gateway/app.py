"""
API Gateway（微服务入口）

默认 :8088。将请求按域拆分转发到：
  core     :8000  — 用户/隐患/应急/生态/驾驶舱
  monitor  :8001  — 监测/IoT
  warning  :8002  — 预警

前端 BACKEND_URL 指向本网关即可。
"""
from __future__ import annotations

import os
import time
from typing import Iterable
from urllib.parse import urljoin

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "8088"))
CORE_URL = os.getenv("CORE_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/") + "/"
MONITOR_URL = os.getenv("MONITOR_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/") + "/"
WARNING_URL = os.getenv("WARNING_SERVICE_URL", "http://127.0.0.1:8002").rstrip("/") + "/"
GATEWAY_TIMEOUT = float(os.getenv("GATEWAY_TIMEOUT", "60"))

# 简易网关限流（进程内；生产可换 Redis）
RATE_LIMIT = int(os.getenv("GATEWAY_PROXY_RATE_LIMIT", "600"))
RATE_WINDOW = int(os.getenv("GATEWAY_PROXY_RATE_WINDOW", "60"))
_rate_bucket: dict[str, list[float]] = {}

app = FastAPI(title="LandslideHazard API Gateway", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 最长前缀优先
ROUTE_TABLE: list[tuple[str, str, str]] = [
    ("/api/monitoring", MONITOR_URL, "monitor"),
    ("/api/warning", WARNING_URL, "warning"),
    ("/api", CORE_URL, "core"),
    ("/admin", CORE_URL, "core"),
]


def resolve_upstream(path: str) -> tuple[str, str]:
    for prefix, base, name in ROUTE_TABLE:
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?"):
            return base, name
    return CORE_URL, "core"


def client_ip(request: Request) -> str:
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def rate_limited(ip: str) -> bool:
    if RATE_LIMIT <= 0:
        return False
    now = time.time()
    window_start = now - RATE_WINDOW
    bucket = _rate_bucket.setdefault(ip, [])
    # prune
    while bucket and bucket[0] < window_start:
        bucket.pop(0)
    if len(bucket) >= RATE_LIMIT:
        return True
    bucket.append(now)
    return False


PROBE_PATHS = {
    "core": "api/",
    "monitor": "health",
    "warning": "health",
}


@app.get("/health")
async def health():
    statuses = {}
    async with httpx.AsyncClient(timeout=3.0) as client:
        for name, url in (
            ("core", CORE_URL),
            ("monitor", MONITOR_URL),
            ("warning", WARNING_URL),
        ):
            try:
                probe = urljoin(url, PROBE_PATHS[name])
                r = await client.get(probe)
                statuses[name] = {"ok": r.status_code < 500, "status": r.status_code, "url": url}
            except Exception as exc:  # noqa: BLE001
                statuses[name] = {"ok": False, "error": str(exc), "url": url}
    ok = all(v.get("ok") for v in statuses.values())
    return {"ok": ok, "service": "gateway", "upstreams": statuses}


@app.get("/")
async def root():
    return {
        "name": "边坡灾害平台 API Gateway",
        "service": "gateway",
        "routes": [
            {"prefix": p, "upstream": u, "service": n} for p, u, n in ROUTE_TABLE
        ],
    }


HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy(path: str, request: Request):
    full_path = "/" + path
    if not full_path.startswith("/"):
        full_path = "/" + full_path

    # health already handled
    if rate_limited(client_ip(request)):
        return JSONResponse({"detail": "请求过于频繁", "code": "gateway_rate_limited"}, status_code=429)

    base, svc = resolve_upstream(full_path)
    query = request.url.query
    target = urljoin(base, path.lstrip("/"))
    if query:
        target = f"{target}?{query}"

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    headers["x-forwarded-service"] = svc
    headers["x-gateway"] = "geohazard-gateway"

    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT, follow_redirects=False) as client:
            upstream = await client.request(
                request.method,
                target,
                headers=headers,
                content=body if body else None,
            )
    except httpx.RequestError as exc:
        return JSONResponse(
            {
                "detail": f"上游服务不可用 ({svc})",
                "service": svc,
                "upstream": base,
                "error": str(exc),
            },
            status_code=502,
        )

    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    resp_headers["x-upstream-service"] = svc
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=GATEWAY_PORT, reload=True)
