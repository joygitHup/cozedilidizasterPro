# 启动附件存储微服务（对接本机 MinIO）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dir = Join-Path $Root "services\storage"
$Port = if ($env:STORAGE_PORT) { [int]$env:STORAGE_PORT } else { 8700 }

if (Test-Path (Join-Path $Root ".env")) {
  Get-Content (Join-Path $Root ".env") | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $kv = $_.Split('=', 2)
    if ($kv.Length -eq 2) {
      [Environment]::SetEnvironmentVariable($kv[0].Trim(), $kv[1].Trim(), "Process")
    }
  }
}

Set-Location $Dir
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt -q

$env:STORAGE_PORT = "$Port"
$env:STORAGE_PUBLIC_BASE = if ($env:STORAGE_PUBLIC_BASE) { $env:STORAGE_PUBLIC_BASE } else { "/storage-api" }
$env:MINIO_ENDPOINT = if ($env:MINIO_ENDPOINT) { $env:MINIO_ENDPOINT } else { "127.0.0.1:9000" }
$env:MINIO_ACCESS_KEY = if ($env:MINIO_ACCESS_KEY) { $env:MINIO_ACCESS_KEY } else { "Admin" }
$env:MINIO_SECRET_KEY = if ($env:MINIO_SECRET_KEY) { $env:MINIO_SECRET_KEY } else { "Admin123" }
$env:MINIO_BUCKET = if ($env:MINIO_BUCKET) { $env:MINIO_BUCKET } else { "geohazard" }

Write-Host "STORAGE_SERVICE http://127.0.0.1:$Port"
Write-Host "MinIO $env:MINIO_ENDPOINT bucket=$env:MINIO_BUCKET"
& .\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port $Port --reload
