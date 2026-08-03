#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 安装依赖
pip3 install django djangorestframework django-cors-headers django-filter --quiet

# 执行数据库迁移
python3 manage.py migrate --run-syncdb 2>/dev/null || true

# 初始化示例数据（如果还没有）
python3 init_data.py 2>/dev/null || true
