#!/usr/bin/env bash
# 启动独立视频服务（需本地 MediaMTX 已监听 8554/8888）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEO_DIR="$ROOT/services/video"
PORT="${VIDEO_PORT:-8600}"
cd "$VIDEO_DIR"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -r requirements.txt -q
export VIDEO_PORT="$PORT"
export MEDIAMTX_HLS_URL="${MEDIAMTX_HLS_URL:-http://127.0.0.1:8888}"
export MEDIAMTX_RTSP_URL="${MEDIAMTX_RTSP_URL:-rtsp://127.0.0.1:8554}"
export MEDIAMTX_WHEP_URL="${MEDIAMTX_WHEP_URL:-http://127.0.0.1:8889}"
export VIDEO_PUBLIC_BASE="${VIDEO_PUBLIC_BASE:-/video-api}"
echo "VIDEO_SERVICE http://127.0.0.1:$PORT"
exec .venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port "$PORT" --reload
