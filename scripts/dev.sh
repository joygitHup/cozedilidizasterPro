#!/bin/bash
set -Eeuo pipefail


PORT=5000
BACKEND_PORT=8000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-${PORT}}"


cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local port=$1
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${port} is free."
      return
    fi
    echo "Port ${port} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${port} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${port} cleared."
    fi
}

echo "Clearing ports before start."
kill_port_if_listening ${DEPLOY_RUN_PORT}
kill_port_if_listening ${BACKEND_PORT}

# 安装后端依赖
echo "Installing backend dependencies..."
pip3 install django djangorestframework django-cors-headers django-filter --quiet 2>/dev/null || true

# 运行后端迁移
echo "Running backend migrations..."
cd backend
python3 manage.py migrate --run-syncdb 2>/dev/null || true
python3 init_data.py 2>/dev/null || true
cd "${COZE_WORKSPACE_PATH}"

# 启动后端 Django 服务（后台运行）
echo "Starting Django backend on port ${BACKEND_PORT}..."
cd backend
python3 manage.py runserver 0.0.0.0:${BACKEND_PORT} &
BACKEND_PID=$!
cd "${COZE_WORKSPACE_PATH}"

# 等待后端启动
sleep 3

echo "Starting Next.js frontend on port ${DEPLOY_RUN_PORT} for dev..."

# 启动前端服务
PORT=${DEPLOY_RUN_PORT} pnpm tsx watch src/server.ts
