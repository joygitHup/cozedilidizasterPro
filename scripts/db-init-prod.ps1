# 本地生产库初始化：Postgres 建库建表 + InfluxDB/TDengine 探测 + 可选种子
# 前置：Postgres 已运行；InfluxDB 建议先：docker compose up -d influxdb

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'

if (Test-Path (Join-Path $Root '.env')) {
  Get-Content (Join-Path $Root '.env') | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $kv = $_.Split('=', 2)
    if ($kv.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), 'Process')
    }
  }
}

$DbEngine = if ($env:DB_ENGINE) { $env:DB_ENGINE.ToLower() } else { 'postgres' }
$DbName = if ($env:DB_NAME) { $env:DB_NAME } else { 'geohazard' }
$DbUser = if ($env:DB_USER) { $env:DB_USER } else { 'forest_user' }
$DbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'forest_pass' }
$DbHost = if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }
$DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { '5432' }
$Tsdb = if ($env:TSDB_BACKEND) { $env:TSDB_BACKEND.ToLower() } else { 'postgres' }
$Seed = $true
$SyncTsdb = $args -contains '-SyncTsdb'
if ($args -contains '-NoSeed') { $Seed = $false }

Write-Host "== Postgres: ensure database '$DbName' ==" -ForegroundColor Cyan
python -m pip install -r (Join-Path $Backend 'requirements-postgres.txt') -q
python -c @"
import psycopg
conn = psycopg.connect(
    host='$DbHost', port=int('$DbPort'), user='$DbUser', password='$DbPass',
    dbname='postgres', connect_timeout=10, autocommit=True,
)
cur = conn.cursor()
cur.execute('SELECT 1 FROM pg_database WHERE datname=%s', ('$DbName',))
if cur.fetchone() is None:
    cur.execute('CREATE DATABASE "$DbName" OWNER "$DbUser" ENCODING ''UTF8''')
    print('created database $DbName')
else:
    print('database $DbName already exists')
cur.close(); conn.close()
"@

Write-Host '== Django migrate ==' -ForegroundColor Cyan
Push-Location $Backend
try {
  $env:DB_ENGINE = $DbEngine
  python manage.py migrate --noinput

  if ($Tsdb -in @('influxdb', 'influx', 'tdengine')) {
    Write-Host "== TSDB schema/probe ($Tsdb) ==" -ForegroundColor Cyan
    $env:DJANGO_SETTINGS_MODULE = 'config.settings'
    python -c "import django; django.setup(); from monitoring import tsdb; tsdb.ensure_schema(); print('TSDB OK', tsdb.tsdb_backend())"
  }

  if ($Seed) {
    Write-Host '== Seed init_data.py ==' -ForegroundColor Cyan
    python init_data.py
  }

  if ($SyncTsdb -or ($Tsdb -in @('influxdb', 'influx') -and -not $Seed)) {
    Write-Host '== Sync Postgres MonitorData → InfluxDB ==' -ForegroundColor Cyan
    $env:DJANGO_SETTINGS_MODULE = 'config.settings'
    python -c @"
import django
django.setup()
from monitoring.models import MonitorData
from monitoring import tsdb
tsdb.ensure_schema()
qs = MonitorData.objects.select_related('device').order_by('id')
batch, n = [], 0
for row in qs.iterator(chunk_size=500):
    batch.append({
        'device_id': row.device_id,
        'device_code': row.device.code,
        'data_type': row.data_type,
        'channel': row.channel or '',
        'value': float(row.value),
        'unit': row.unit or '',
        'record_time': row.record_time,
    })
    if len(batch) >= 500:
        n += tsdb.write_monitor_points_batch(batch)
        batch = []
if batch:
    n += tsdb.write_monitor_points_batch(batch)
print('synced', n, 'points to', tsdb.tsdb_backend())
"@
  }
} finally {
  Pop-Location
}

Write-Host "Done. TSDB=$Tsdb  Restart: scripts/dev.ps1" -ForegroundColor Green
