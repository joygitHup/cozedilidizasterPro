# 数据库迁移（开发 sqlite / 生产 postgres）
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'

Push-Location $Backend
try {
  Write-Host "DB_ENGINE=$env:DB_ENGINE DEBUG=$env:DEBUG" -ForegroundColor Cyan
  python manage.py migrate --noinput
  python manage.py showmigrations
} finally {
  Pop-Location
}
