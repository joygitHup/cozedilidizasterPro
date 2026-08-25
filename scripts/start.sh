#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-5000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

PYTHON_BIN="python3"
command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"

FRONTEND_PORT="$("${PYTHON_BIN}" scripts/find_free_port.py --start "${PORT}")"
ACTUAL_BACKEND_PORT="$("${PYTHON_BIN}" scripts/find_free_port.py --start "${BACKEND_PORT}")"

if [[ "${FRONTEND_PORT}" != "${PORT}" ]]; then
  echo "Frontend port ${PORT} busy → using ${FRONTEND_PORT}"
fi
if [[ "${ACTUAL_BACKEND_PORT}" != "${BACKEND_PORT}" ]]; then
  echo "Backend port ${BACKEND_PORT} busy → using ${ACTUAL_BACKEND_PORT}"
fi

export BACKEND_URL="http://127.0.0.1:${ACTUAL_BACKEND_PORT}"

echo "Starting Django backend on port ${ACTUAL_BACKEND_PORT}..."
cd backend
"${PYTHON_BIN}" manage.py runserver "0.0.0.0:${ACTUAL_BACKEND_PORT}" &
BACKEND_PID=$!
cd "${COZE_WORKSPACE_PATH}"

echo "Starting Next.js frontend on port ${FRONTEND_PORT}..."
PORT="${FRONTEND_PORT}" BACKEND_URL="${BACKEND_URL}" node dist/server.js &
FRONTEND_PID=$!

cleanup() {
  kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT

wait -n $BACKEND_PID $FRONTEND_PID || true
