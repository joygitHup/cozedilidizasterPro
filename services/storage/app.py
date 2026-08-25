"""
附件存储微服务：对接 MinIO（S3 API）。

默认端口 8700。经 Next 反代：/storage-api → 本服务。
复用本机已有 MinIO（默认 127.0.0.1:9000）或 docker compose 独立实例。
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from minio import Minio
from minio.error import S3Error

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "Admin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "Admin123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "geohazard")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
PUBLIC_BASE = os.getenv("STORAGE_PUBLIC_BASE", "/storage-api").rstrip("/")
PRESIGN_EXPIRE = int(os.getenv("MINIO_PRESIGN_EXPIRE", "3600"))

app = FastAPI(title="LandslideHazard Storage Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client: Optional[Minio] = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _client


def ensure_bucket() -> None:
    client = get_client()
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)


def safe_name(name: str) -> str:
    base = Path(name or "file").name
    base = re.sub(r"[^\w.\-\u4e00-\u9fff]+", "_", base)
    return base[:180] or "file"


def object_url(key: str) -> str:
    return f"{PUBLIC_BASE}/objects/{quote(key, safe='/')}"


@app.on_event("startup")
def on_startup() -> None:
    try:
        ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        # 启动不因 MinIO 短暂不可用而失败，health 会反映状态
        print(f"[storage] bucket ensure failed: {exc}")


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        ensure_bucket()
        return {
            "ok": True,
            "service": "storage",
            "endpoint": MINIO_ENDPOINT,
            "bucket": MINIO_BUCKET,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "service": "storage", "error": str(exc)}


@app.post("/api/storage/upload")
async def upload(
    file: UploadFile = File(...),
    folder: str = Form("attachments"),
    biz_type: str = Form(""),
    biz_id: str = Form(""),
) -> dict[str, Any]:
    """上传附件，返回可经网关访问的 URL（写入 hazard.photos/files 等 JSON 字段）。"""
    try:
        ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"MinIO 不可用: {exc}") from exc

    folder = re.sub(r"[^\w\-_/]+", "", folder or "attachments").strip("/") or "attachments"
    parts = [folder]
    if biz_type:
        parts.append(re.sub(r"[^\w\-]+", "", biz_type))
    if biz_id:
        parts.append(re.sub(r"[^\w\-]+", "", biz_id))
    parts.append(f"{uuid.uuid4().hex[:12]}_{safe_name(file.filename or 'file')}")
    key = "/".join(parts)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="空文件")
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="文件超过 100MB")

    from io import BytesIO

    content_type = file.content_type or "application/octet-stream"
    try:
        get_client().put_object(
            MINIO_BUCKET,
            key,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
    except S3Error as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "ok": True,
        "bucket": MINIO_BUCKET,
        "key": key,
        "filename": file.filename,
        "size": len(data),
        "content_type": content_type,
        "url": object_url(key),
        "biz_type": biz_type,
        "biz_id": biz_id,
    }


@app.get("/api/storage/list")
def list_objects(prefix: str = "attachments/", limit: int = 100) -> dict[str, Any]:
    try:
        ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    limit = max(1, min(int(limit), 500))
    items = []
    for obj in get_client().list_objects(MINIO_BUCKET, prefix=prefix, recursive=True):
        items.append(
            {
                "key": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                "url": object_url(obj.object_name),
            }
        )
        if len(items) >= limit:
            break
    return {"prefix": prefix, "count": len(items), "results": items}


@app.get("/api/storage/presign")
def presign(key: str, method: str = "GET") -> dict[str, Any]:
    try:
        ensure_bucket()
        url = get_client().presigned_get_object(
            MINIO_BUCKET, key, expires=timedelta(seconds=PRESIGN_EXPIRE)
        )
        if method.upper() == "PUT":
            url = get_client().presigned_put_object(
                MINIO_BUCKET, key, expires=timedelta(seconds=PRESIGN_EXPIRE)
            )
        return {"key": key, "url": url, "expires": PRESIGN_EXPIRE}
    except S3Error as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/storage/object")
def delete_object(key: str) -> dict[str, Any]:
    try:
        get_client().remove_object(MINIO_BUCKET, key)
        return {"ok": True, "key": key}
    except S3Error as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/objects/{key:path}")
def get_object(key: str):
    """网关直出对象（开发用；生产可改 Nginx 直连 MinIO）。"""
    try:
        obj = get_client().get_object(MINIO_BUCKET, key)
    except S3Error as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    headers = {}
    if obj.headers.get("Content-Type"):
        headers["Content-Type"] = obj.headers["Content-Type"]
    return StreamingResponse(obj, media_type=headers.get("Content-Type"), headers=headers)


@app.get("/api/storage/models")
def list_models() -> dict[str, Any]:
    """三维模型目录（MinIO models/ 前缀 + 内置示例）。"""
    catalog = []
    try:
        ensure_bucket()
        for obj in get_client().list_objects(MINIO_BUCKET, prefix="models/", recursive=True):
            name = obj.object_name
            if name.lower().endswith((".json", ".glb", ".gltf", ".b3dm", "/tileset.json")):
                catalog.append(
                    {
                        "id": name,
                        "name": Path(name).name,
                        "key": name,
                        "url": object_url(name),
                        "size": obj.size,
                        "source": "minio",
                    }
                )
    except Exception:  # noqa: BLE001
        pass

    # 无上传模型时提供 Cesium 官方示例地形场景占位
    if not catalog:
        catalog = [
            {
                "id": "demo-world",
                "name": "全球底图演示（Ion 免费地形可选）",
                "key": "",
                "url": "",
                "viewer": "cesium-demo",
                "source": "builtin",
                "longitude": 104.06,
                "latitude": 30.67,
                "height": 2500,
                "description": "默认飞至四川盆地示意区域，可替换为 MinIO 中的 3D Tiles",
            }
        ]
    return {"count": len(catalog), "results": catalog}
