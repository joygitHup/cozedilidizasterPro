#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

# 加载 .env（若存在）
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-5000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:${BACKEND_PORT}}"

PYTHON_BIN="python3"
command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"

find_port() {
  local start=$1
  "${PYTHON_BIN}" scripts/find_free_port.py --start "${start}"
}

FRONTEND_PORT="$(find_port "${PORT}")"
ACTUAL_BACKEND_PORT="$(find_port "${BACKEND_PORT}")"

if [[ "${FRONTEND_PORT}" != "${PORT}" ]]; then
  echo "Frontend port ${PORT} busy → using ${FRONTEND_PORT}"
fi
if [[ "${ACTUAL_BACKEND_PORT}" != "${BACKEND_PORT}" ]]; then
  echo "Backend port ${BACKEND_PORT} busy → using ${ACTUAL_BACKEND_PORT}"
fi

export BACKEND_URL="http://127.0.0.1:${ACTUAL_BACKEND_PORT}"
export PORT="${FRONTEND_PORT}"

echo "Installing backend dependencies..."
"${PYTHON_BIN}" -m pip install -r backend/requirements.txt --quiet

echo "Running migrations..."
cd backend
"${PYTHON_BIN}" manage.py migrate --noinput
"${PYTHON_BIN}" init_data.py || true
cd "${COZE_WORKSPACE_PATH}"

echo "Starting Django backend on port ${ACTUAL_BACKEND_PORT}..."
cd backend
"${PYTHON_BIN}" manage.py runserver "0.0.0.0:${ACTUAL_BACKEND_PORT}" &
BACKEND_PID=$!
cd "${COZE_WORKSPACE_PATH}"

cleanup() {
  kill "${BACKEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT

sleep 2
echo "Frontend → http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend  → ${BACKEND_URL}"
echo "API proxy destination: ${BACKEND_URL}"

PORT="${FRONTEND_PORT}" BACKEND_URL="${BACKEND_URL}" pnpm tsx watch src/server.ts
