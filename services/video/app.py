"""
独立视频服务：对接本地 MediaMTX（RTSP 推流 → HLS/WebRTC 播放）。

默认端口 8600。依赖已运行的 MediaMTX：
  RTSP  8554  ← ffmpeg 推流 rtsp://127.0.0.1:8554/cam1
  HLS   8888
  WebRTC/WHEP 8889
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
CAMERAS_FILE = Path(os.getenv("VIDEO_CAMERAS_FILE", BASE_DIR / "cameras.yaml"))

MEDIAMTX_HLS = os.getenv("MEDIAMTX_HLS_URL", "http://127.0.0.1:8888").rstrip("/")
MEDIAMTX_RTSP = os.getenv("MEDIAMTX_RTSP_URL", "rtsp://127.0.0.1:8554").rstrip("/")
MEDIAMTX_WHEP = os.getenv("MEDIAMTX_WHEP_URL", "http://127.0.0.1:8889").rstrip("/")
# 返回给前端的播放基址（经 Next 反代，避免跨域）
PUBLIC_BASE = os.getenv("VIDEO_PUBLIC_BASE", "/video-api").rstrip("/")

app = FastAPI(title="LandslideHazard Video Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_cameras() -> List[Dict[str, Any]]:
    if not CAMERAS_FILE.exists():
        return []
    data = yaml.safe_load(CAMERAS_FILE.read_text(encoding="utf-8")) or {}
    return list(data.get("cameras") or [])


def find_camera(cam_id: str) -> Optional[Dict[str, Any]]:
    for cam in load_cameras():
        if cam.get("id") == cam_id or cam.get("code") == cam_id:
            return cam
    return None


async def probe_hls(path: str) -> Dict[str, Any]:
    url = f"{MEDIAMTX_HLS}/{path}/index.m3u8"
    try:
        async with httpx.AsyncClient(timeout=2.5, follow_redirects=True) as client:
            resp = await client.get(url)
        body = resp.content or b""
        online = resp.status_code == 200 and b"#EXTM3U" in body[:128]
        return {
            "online": online,
            "http_status": resp.status_code,
            "bytes": len(body) if online else 0,
        }
    except Exception as exc:  # noqa: BLE001
        return {"online": False, "http_status": 0, "error": str(exc)}


def enrich_camera(cam: Dict[str, Any], probe: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    path = cam.get("rtsp_path") or cam["id"]
    status = "online" if probe and probe.get("online") else "offline"
    if cam.get("enabled") is False:
        status = "disabled"
    return {
        "id": cam["id"],
        "code": cam.get("code") or cam["id"].upper(),
        "name": cam.get("name") or cam["id"],
        "location": cam.get("location") or "",
        "description": cam.get("description") or "",
        "device_code": cam.get("device_code"),
        "enabled": cam.get("enabled", True),
        "status": status,
        "rtsp_url": f"{MEDIAMTX_RTSP}/{path}",
        "hls_url": f"{PUBLIC_BASE}/hls/{path}/index.m3u8",
        "hls_direct_url": f"{MEDIAMTX_HLS}/{path}/index.m3u8",
        "whep_url": f"{MEDIAMTX_WHEP}/{path}/whep",
        "rtsp_path": path,
        "probe": probe or {},
    }


@app.get("/health")
async def health():
    cams = load_cameras()
    return {
        "ok": True,
        "service": "video",
        "mediamtx_hls": MEDIAMTX_HLS,
        "mediamtx_rtsp": MEDIAMTX_RTSP,
        "cameras": len(cams),
    }


@app.get("/api/video/cameras")
@app.get("/api/video/cameras/")
async def list_cameras(probe: bool = True):
    result = []
    for cam in load_cameras():
        if not cam.get("enabled", True):
            result.append(enrich_camera(cam, {"online": False}))
            continue
        p = await probe_hls(cam.get("rtsp_path") or cam["id"]) if probe else None
        result.append(enrich_camera(cam, p))
    online = sum(1 for c in result if c["status"] == "online")
    return {
        "count": len(result),
        "online": online,
        "offline": len(result) - online,
        "results": result,
    }


@app.get("/api/video/cameras/{cam_id}")
@app.get("/api/video/cameras/{cam_id}/")
async def get_camera(cam_id: str):
    cam = find_camera(cam_id)
    if not cam:
        raise HTTPException(status_code=404, detail="摄像头不存在")
    p = await probe_hls(cam.get("rtsp_path") or cam["id"])
    return enrich_camera(cam, p)


@app.get("/api/video/cameras/{cam_id}/status")
@app.get("/api/video/cameras/{cam_id}/status/")
async def camera_status(cam_id: str):
    cam = find_camera(cam_id)
    if not cam:
        raise HTTPException(status_code=404, detail="摄像头不存在")
    path = cam.get("rtsp_path") or cam["id"]
    p = await probe_hls(path)
    return {
        "id": cam["id"],
        "code": cam.get("code"),
        "status": "online" if p.get("online") else "offline",
        "probe": p,
        "hls_url": f"{PUBLIC_BASE}/hls/{path}/index.m3u8",
    }


@app.api_route("/hls/{path:path}", methods=["GET", "HEAD", "OPTIONS"])
async def proxy_hls(path: str, request: Request):
    """反代 MediaMTX HLS，附带 CORS，供浏览器 hls.js 播放。"""
    if request.method == "OPTIONS":
        return Response(
            status_code=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    target = f"{MEDIAMTX_HLS}/{path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"

    headers = {}
    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    try:
        upstream = await client.send(
            client.build_request(request.method, target, headers=headers),
            stream=True,
        )
    except Exception as exc:  # noqa: BLE001
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"HLS 上游不可用: {exc}") from exc

    excluded = {
        "content-encoding",
        "transfer-encoding",
        "connection",
        "access-control-allow-origin",
    }
    out_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in excluded
    }
    out_headers["Access-Control-Allow-Origin"] = "*"
    out_headers["Cache-Control"] = "no-cache"

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=upstream.headers.get("content-type"),
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("VIDEO_PORT", "8600"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
