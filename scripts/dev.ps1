# Windows PowerShell 开发启动脚本
# 端口占用时自动递增；不杀已有进程

$ErrorActionPreference = "Stop"
$Root = if ($env:COZE_WORKSPACE_PATH) { $env:COZE_WORKSPACE_PATH } else { (Get-Location).Path }
Set-Location $Root

if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $kv = $_.Split('=', 2)
    if ($kv.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), "Process")
    }
  }
}

$UseMs = ($env:USE_MICROSERVICES -eq '1' -or $env:USE_MICROSERVICES -eq 'true')
$Port = if ($env:PORT) { [int]$env:PORT } else { 5000 }
$BackendPort = if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 8000 }
$CorePort = if ($env:CORE_PORT) { [int]$env:CORE_PORT } else { 8000 }
$MonitorPort = if ($env:MONITOR_PORT) { [int]$env:MONITOR_PORT } else { 8001 }
$WarningPort = if ($env:WARNING_PORT) { [int]$env:WARNING_PORT } else { 8002 }
$GatewayPort = if ($env:GATEWAY_PORT) { [int]$env:GATEWAY_PORT } else { 8088 }

$FrontendPort = & python scripts/find_free_port.py --start $Port
if ($FrontendPort -ne $Port) { Write-Host "Frontend port $Port busy → using $FrontendPort" }
$env:PORT = "$FrontendPort"

$VideoPort = if ($env:VIDEO_PORT) { [int]$env:VIDEO_PORT } else { 8600 }
$ActualVideoPort = & python scripts/find_free_port.py --start $VideoPort
if ($ActualVideoPort -ne $VideoPort) { Write-Host "Video port $VideoPort busy → using $ActualVideoPort" }
$env:VIDEO_SERVICE_URL = "http://127.0.0.1:$ActualVideoPort"
$env:VIDEO_PORT = "$ActualVideoPort"
$env:VIDEO_PUBLIC_BASE = "/video-api"

Write-Host "Installing backend dependencies..."
python -m pip install -r backend/requirements.txt -q
if ($env:DB_ENGINE -and $env:DB_ENGINE.ToLower() -eq 'postgres') {
  python -m pip install -r backend/requirements-postgres.txt -q
}

Write-Host "Running migrations..."
Push-Location backend
$env:DJANGO_ROOT_URLCONF = "config.urls"
python manage.py migrate --noinput
if ($env:TSDB_BACKEND -and $env:TSDB_BACKEND.ToLower() -in @('influxdb','influx','tdengine')) {
  $env:DJANGO_SETTINGS_MODULE = 'config.settings'
  python -c "import django; django.setup(); from monitoring import tsdb; tsdb.ensure_schema(); print('TSDB OK', tsdb.tsdb_backend())"
}
python init_data.py
Pop-Location

$procs = @()
$gatewayDir = Join-Path $Root "services\gateway"

if ($UseMs) {
  Write-Host "Mode: MICROSERVICES (Django core + FastAPI monitor/warning + gateway)" -ForegroundColor Cyan
  function Ensure-Venv([string]$Dir) {
    $py = Join-Path $Dir ".venv\Scripts\python.exe"
    if (-not (Test-Path $py)) {
      python -m venv (Join-Path $Dir ".venv")
      & $py -m pip install -r (Join-Path $Dir "requirements.txt") -q
    }
    return $py
  }
  Write-Host "Starting core :$CorePort (urls_core)"
  $env:DJANGO_ROOT_URLCONF = "config.urls_core"
  $env:SERVICE_NAME = "core"
  $procs += Start-Process -PassThru -NoNewWindow python -ArgumentList @(
    "manage.py", "runserver", "0.0.0.0:$CorePort", "--noreload"
  ) -WorkingDirectory (Join-Path $Root "backend")
  Start-Sleep -Milliseconds 800

  $monitorDir = Join-Path $Root "services\monitor"
  $warningDir = Join-Path $Root "services\warning"
  $monPy = Ensure-Venv $monitorDir
  $warnPy = Ensure-Venv $warningDir
  Write-Host "Starting monitor (FastAPI) :$MonitorPort"
  $env:SERVICE_DB_PREFIX = "MONITOR"
  $env:SERVICE_NAME = "monitor"
  $procs += Start-Process -PassThru -NoNewWindow -FilePath $monPy -ArgumentList @(
    "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$MonitorPort"
  ) -WorkingDirectory $monitorDir
  Start-Sleep -Milliseconds 800
  Write-Host "Starting warning (FastAPI) :$WarningPort"
  $env:SERVICE_DB_PREFIX = "WARNING"
  $env:SERVICE_NAME = "warning"
  $procs += Start-Process -PassThru -NoNewWindow -FilePath $warnPy -ArgumentList @(
    "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$WarningPort"
  ) -WorkingDirectory $warningDir

  if (-not (Test-Path (Join-Path $gatewayDir ".venv\Scripts\python.exe"))) {
    python -m venv (Join-Path $gatewayDir ".venv")
    & (Join-Path $gatewayDir ".venv\Scripts\python.exe") -m pip install -r (Join-Path $gatewayDir "requirements.txt") -q
  }
  $env:CORE_SERVICE_URL = "http://127.0.0.1:$CorePort"
  $env:MONITOR_SERVICE_URL = "http://127.0.0.1:$MonitorPort"
  $env:WARNING_SERVICE_URL = "http://127.0.0.1:$WarningPort"
  $env:GATEWAY_PORT = "$GatewayPort"
  $env:BACKEND_URL = "http://127.0.0.1:$GatewayPort"
  $env:DJANGO_INGEST_URL = "http://127.0.0.1:$GatewayPort/api/monitoring/ingest/mqtt/"
  Write-Host "Starting gateway :$GatewayPort"
  $procs += Start-Process -PassThru -NoNewWindow -FilePath (Join-Path $gatewayDir ".venv\Scripts\python.exe") -ArgumentList @(
    "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$GatewayPort"
  ) -WorkingDirectory $gatewayDir
} else {
  Write-Host "Mode: MONOLITH" -ForegroundColor Cyan
  $ActualBackendPort = & python scripts/find_free_port.py --start $BackendPort
  if ($ActualBackendPort -ne $BackendPort) { Write-Host "Backend port $BackendPort busy → using $ActualBackendPort" }
  $env:BACKEND_URL = "http://127.0.0.1:$ActualBackendPort"
  $env:DJANGO_ROOT_URLCONF = "config.urls"
  $env:SERVICE_NAME = "monolith"
  Write-Host "Starting Django on $ActualBackendPort ..."
  $procs += Start-Process -PassThru -NoNewWindow python -ArgumentList @(
    "manage.py", "runserver", "0.0.0.0:$ActualBackendPort"
  ) -WorkingDirectory (Join-Path $Root "backend")
}

Write-Host "Starting video service on $ActualVideoPort ..."
$videoDir = Join-Path $Root "services\video"
if (-not (Test-Path (Join-Path $videoDir ".venv\Scripts\python.exe"))) {
  python -m venv (Join-Path $videoDir ".venv")
  & (Join-Path $videoDir ".venv\Scripts\python.exe") -m pip install -r (Join-Path $videoDir "requirements.txt") -q
}
$procs += Start-Process -PassThru -NoNewWindow -FilePath (Join-Path $videoDir ".venv\Scripts\python.exe") -ArgumentList @(
  "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$ActualVideoPort"
) -WorkingDirectory $videoDir

try {
  Start-Sleep -Seconds 2
  Write-Host "Frontend → http://127.0.0.1:$FrontendPort"
  Write-Host "Backend  → $env:BACKEND_URL"
  Write-Host "Video    → $env:VIDEO_SERVICE_URL  (proxy /video-api)"
  pnpm tsx watch src/server.ts
} finally {
  foreach ($p in $procs) {
    if ($p -and -not $p.HasExited) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
