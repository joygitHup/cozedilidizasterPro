# 启动独立视频服务（需本地 MediaMTX 已监听 8554/8888）
# 推流示例见 services/video/cameras.yaml 注释
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VideoDir = Join-Path $Root "services\video"
$Port = if ($env:VIDEO_PORT) { [int]$env:VIDEO_PORT } else { 8600 }

Set-Location $VideoDir
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt -q
$env:VIDEO_PORT = "$Port"
$env:MEDIAMTX_HLS_URL = if ($env:MEDIAMTX_HLS_URL) { $env:MEDIAMTX_HLS_URL } else { "http://127.0.0.1:8888" }
$env:MEDIAMTX_RTSP_URL = if ($env:MEDIAMTX_RTSP_URL) { $env:MEDIAMTX_RTSP_URL } else { "rtsp://127.0.0.1:8554" }
$env:MEDIAMTX_WHEP_URL = if ($env:MEDIAMTX_WHEP_URL) { $env:MEDIAMTX_WHEP_URL } else { "http://127.0.0.1:8889" }
$env:VIDEO_PUBLIC_BASE = if ($env:VIDEO_PUBLIC_BASE) { $env:VIDEO_PUBLIC_BASE } else { "/video-api" }

Write-Host "VIDEO_SERVICE http://127.0.0.1:$Port"
Write-Host "Expect MediaMTX HLS at $env:MEDIAMTX_HLS_URL  RTSP at $env:MEDIAMTX_RTSP_URL"
& .\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port $Port --reload
