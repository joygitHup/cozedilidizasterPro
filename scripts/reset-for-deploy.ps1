# 现场部署前：清空业务/演示数据，仅保留系统默认
# 用法：
#   pwsh scripts/reset-for-deploy.ps1
#   pwsh scripts/reset-for-deploy.ps1 -AdminPassword 'YourStrongPass'
#   pwsh scripts/reset-for-deploy.ps1 -KeepRegions

param(
  [string]$AdminPassword = 'admin123',
  [switch]$KeepRegions,
  [switch]$Force
)

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

Write-Host ''
Write-Host '========================================' -ForegroundColor Yellow
Write-Host '  将清空全部业务数据（不可恢复）' -ForegroundColor Yellow
Write-Host '  仅保留：admin + 系统配置 + 默认阈值模型' -ForegroundColor Yellow
Write-Host '  同时清空：services/video/cameras.yaml 演示通道' -ForegroundColor Yellow
Write-Host '========================================' -ForegroundColor Yellow
Write-Host ''

if (-not $Force) {
  $ans = Read-Host '确认执行？输入 YES 继续'
  if ($ans -ne 'YES') {
    Write-Host '已取消'
    exit 1
  }
}

$argsList = @('manage.py', 'reset_for_deploy', '--yes', '--admin-password', $AdminPassword)
if ($KeepRegions) { $argsList += '--keep-regions' }

Push-Location $Backend
try {
  python @argsList
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host '现场建议：' -ForegroundColor Cyan
Write-Host '  1. 登录后立即修改 admin 密码'
Write-Host '  2. 在「系统配置」填写现场天气测点 / 通知通道'
Write-Host '  3. 配置 .env 中 MQTT/短信/Mapbox 等生产密钥'
Write-Host '  4. 勿再执行 python init_data.py（会写入演示数据）'
Write-Host '  5. 视频监控：编辑 services/video/cameras.yaml（实施配置）后重启视频服务'
Write-Host '  6. 修改管理员密码：python manage.py change_admin_password --password ''强密码'''
Write-Host '  7. .env 设 DEBUG=False，核对 DB_* 与 MQTT_INGEST_TOKEN'
