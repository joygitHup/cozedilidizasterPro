# 微服务模式：Core(Django) + Monitor(FastAPI) + Warning(FastAPI) + Gateway
# 前端 BACKEND_URL=http://127.0.0.1:8088
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Gateway = Join-Path $Root "services\gateway"
$Monitor = Join-Path $Root "services\monitor"
$Warning = Join-Path $Root "services\warning"

if (Test-Path (Join-Path $Root ".env")) {
  Get-Content (Join-Path $Root ".env") | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $kv = $_.Split('=', 2)
    if ($kv.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), "Process")
    }
  }
}

$CorePort = if ($env:CORE_PORT) { [int]$env:CORE_PORT } else { 8000 }
$MonitorPort = if ($env:MONITOR_PORT) { [int]$env:MONITOR_PORT } else { 8001 }
$WarningPort = if ($env:WARNING_PORT) { [int]$env:WARNING_PORT } else { 8002 }
$GatewayPort = if ($env:GATEWAY_PORT) { [int]$env:GATEWAY_PORT } else { 8088 }

function Ensure-Venv([string]$Dir) {
  $py = Join-Path $Dir ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) {
    Write-Host "Creating venv: $Dir" -ForegroundColor Yellow
    python -m venv (Join-Path $Dir ".venv")
    & $py -m pip install -r (Join-Path $Dir "requirements.txt") -q
  }
  return $py
}

function Start-FastapiSvc([string]$Name, [string]$Dir, [int]$Port, [string]$DbPrefix) {
  Write-Host "Starting $Name (FastAPI) on :$Port" -ForegroundColor Cyan
  $py = Ensure-Venv $Dir
  $env:SERVICE_DB_PREFIX = $DbPrefix
  $env:SERVICE_NAME = $Name
  return Start-Process -PassThru -NoNewWindow -FilePath $py -ArgumentList @(
    "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$Port"
  ) -WorkingDirectory $Dir
}

Write-Host "== Microservices boot (FastAPI monitor/warning) ==" -ForegroundColor Green

Write-Host "Starting core (Django) on :$CorePort" -ForegroundColor Cyan
$env:DJANGO_ROOT_URLCONF = "config.urls_core"
$env:SERVICE_NAME = "core"
$core = Start-Process -PassThru -NoNewWindow -FilePath "python" -ArgumentList @(
  "manage.py", "runserver", "0.0.0.0:$CorePort", "--noreload"
) -WorkingDirectory $Backend
Start-Sleep -Seconds 1

$mon = Start-FastapiSvc "monitor" $Monitor $MonitorPort "MONITOR"
Start-Sleep -Milliseconds 800
$warn = Start-FastapiSvc "warning" $Warning $WarningPort "WARNING"
Start-Sleep -Milliseconds 800

$gwPy = Ensure-Venv $Gateway
$env:CORE_SERVICE_URL = "http://127.0.0.1:$CorePort"
$env:MONITOR_SERVICE_URL = "http://127.0.0.1:$MonitorPort"
$env:WARNING_SERVICE_URL = "http://127.0.0.1:$WarningPort"
$env:GATEWAY_PORT = "$GatewayPort"
Write-Host "Starting gateway on :$GatewayPort" -ForegroundColor Cyan
$gw = Start-Process -PassThru -NoNewWindow -FilePath $gwPy -ArgumentList @(
  "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$GatewayPort"
) -WorkingDirectory $Gateway

Write-Host ""
Write-Host "Gateway  http://127.0.0.1:$GatewayPort" -ForegroundColor Green
Write-Host "Core     http://127.0.0.1:$CorePort    (Django urls_core)"
Write-Host "Monitor  http://127.0.0.1:$MonitorPort    (FastAPI SQLAlchemy)"
Write-Host "Warning  http://127.0.0.1:$WarningPort    (FastAPI SQLAlchemy)"
Write-Host "Set frontend: BACKEND_URL=http://127.0.0.1:$GatewayPort"
Write-Host "Press Ctrl+C to stop gateway; other PIDs: $($core.Id), $($mon.Id), $($warn.Id)"
Write-Host ""

try {
  Wait-Process -Id $gw.Id
} finally {
  foreach ($p in @($core, $mon, $warn, $gw)) {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  Write-Host "Stopped."
}
