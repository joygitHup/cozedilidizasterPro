# 启动 IoT：MQTT bridge + Celery worker + Celery beat
# 复用已运行 MQTT(:1883) + Redis(:6379)，不安装同类服务；Celery 默认用 Redis db4
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Bridge = Join-Path $Root 'services\mqtt_bridge'

$env:MQTT_HOST = if ($env:MQTT_HOST) { $env:MQTT_HOST } else { '127.0.0.1' }
$env:MQTT_PORT = if ($env:MQTT_PORT) { $env:MQTT_PORT } else { '1883' }
$env:MQTT_INGEST_TOKEN = if ($env:MQTT_INGEST_TOKEN) { $env:MQTT_INGEST_TOKEN } else { 'dev-mqtt-ingest-token' }
$env:DJANGO_INGEST_URL = if ($env:DJANGO_INGEST_URL) { $env:DJANGO_INGEST_URL } else { 'http://127.0.0.1:8000/api/monitoring/ingest/mqtt/' }
$env:CELERY_BROKER_URL = if ($env:CELERY_BROKER_URL) { $env:CELERY_BROKER_URL } else { 'redis://127.0.0.1:6379/4' }
$env:CELERY_RESULT_BACKEND = if ($env:CELERY_RESULT_BACKEND) { $env:CELERY_RESULT_BACKEND } else { 'redis://127.0.0.1:6379/4' }
$env:REDIS_URL = if ($env:REDIS_URL) { $env:REDIS_URL } else { 'redis://127.0.0.1:6379/3' }
$env:MQTT_SHARE_GROUP = if ($env:MQTT_SHARE_GROUP) { $env:MQTT_SHARE_GROUP } else { 'geohazard' }
$env:MQTT_BRIDGE_SPOOL_DIR = if ($env:MQTT_BRIDGE_SPOOL_DIR) { $env:MQTT_BRIDGE_SPOOL_DIR } else { (Join-Path $Bridge 'spool') }

Write-Host '== IoT stack (reuse MQTT Broker + Redis) ==' -ForegroundColor Cyan
Write-Host "MQTT  $($env:MQTT_HOST):$($env:MQTT_PORT)"
Write-Host "Ingest $($env:DJANGO_INGEST_URL)"
Write-Host "Broker $($env:CELERY_BROKER_URL)"
Write-Host "Redis  $($env:REDIS_URL)"
Write-Host "Share $($env:MQTT_SHARE_GROUP)  spool=$($env:MQTT_BRIDGE_SPOOL_DIR)"

# 依赖（已装则跳过）
python -c "import celery,paho.mqtt,requests" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Installing celery / paho-mqtt ...' -ForegroundColor Yellow
  pip install -q -r (Join-Path $Backend 'requirements.txt')
  pip install -q -r (Join-Path $Bridge 'requirements.txt')
}

Push-Location $Backend
try {
  python manage.py migrate monitoring --noinput
} finally {
  Pop-Location
}

$jobs = @()

$jobs += Start-Process -PassThru -WindowStyle Minimized -FilePath 'python' -ArgumentList @(
  '-m', 'celery', '-A', 'config', 'worker', '-l', 'info', '-P', 'solo', '-Q', 'geohazard'
) -WorkingDirectory $Backend

$jobs += Start-Process -PassThru -WindowStyle Minimized -FilePath 'python' -ArgumentList @(
  '-m', 'celery', '-A', 'config', 'beat', '-l', 'info'
) -WorkingDirectory $Backend

$jobs += Start-Process -PassThru -WindowStyle Minimized -FilePath 'python' -ArgumentList @(
  'app.py'
) -WorkingDirectory $Bridge

Write-Host ''
Write-Host 'Started:' -ForegroundColor Green
Write-Host "  celery worker  pid=$($jobs[0].Id)"
Write-Host "  celery beat    pid=$($jobs[1].Id)"
Write-Host "  mqtt bridge    pid=$($jobs[2].Id)"
Write-Host ''
Write-Host 'MQTT.fx 说明: services/mqtt_bridge/MQTT_FX.txt'
Write-Host 'Stop: Stop-Process -Id ' + ($jobs.Id -join ',')
