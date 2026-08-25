# 停止微服务相关进程（gateway + FastAPI monitor/warning + core runserver）
$ErrorActionPreference = "SilentlyContinue"
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      ($_.CommandLine -match 'uvicorn app:app' -and $_.CommandLine -match 'services\\(gateway|monitor|warning)') -or
      ($_.CommandLine -match 'manage\.py runserver' -and $_.CommandLine -match '0\.0\.0\.0:800[012]') -or
      ($_.CommandLine -match 'LandslidehazardPro\\services\\(gateway|monitor|warning)')
    )
  } |
  ForEach-Object {
    Write-Host "Stop PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force
  }
Write-Host "Done."
