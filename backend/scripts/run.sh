#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 后端运行在 8000 端口，前端通过 Next.js rewrites 代理
BACKEND_PORT=8000

# 清理残留（绝不碰 9000）
fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
sleep 1

# 启动 Django 开发服务器
exec python3 manage.py runserver 0.0.0.0:${BACKEND_PORT}
