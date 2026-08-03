#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"
BACKEND_PORT=8000

cd "${COZE_WORKSPACE_PATH}"

# 启动后端 Django 服务（后台运行）
echo "Starting Django backend on port ${BACKEND_PORT}..."
cd backend
python3 manage.py runserver 0.0.0.0:${BACKEND_PORT} &
BACKEND_PID=$!
cd "${COZE_WORKSPACE_PATH}"

# 等待后端启动
sleep 3

# 启动前端服务
echo "Starting Next.js frontend on port ${DEPLOY_RUN_PORT}..."
PORT=${DEPLOY_RUN_PORT} node dist/server.js &
FRONTEND_PID=$!

# 等待任一进程退出
wait -n $BACKEND_PID $FRONTEND_PID || true
