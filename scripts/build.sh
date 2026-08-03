#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing frontend dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Installing backend dependencies..."
pip3 install django djangorestframework django-cors-headers django-filter --quiet

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Running backend migrations..."
cd backend
python3 manage.py migrate --run-syncdb 2>/dev/null || true
python3 init_data.py 2>/dev/null || true

echo "Build completed successfully!"
