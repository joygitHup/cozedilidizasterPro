# Postgres 备份 / 恢复（DB_ENGINE=postgres 时使用）
# 备份: powershell -File scripts/db-backup.ps1
# 恢复: powershell -File scripts/db-backup.ps1 -Restore -File backups\xxx.dump
param(
  [switch]$Restore,
  [string]$File = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $Root 'backups'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$Db = if ($env:DB_NAME) { $env:DB_NAME } else { 'geohazard' }
$User = if ($env:DB_USER) { $env:DB_USER } else { 'geohazard_user' }
$HostName = if ($env:DB_HOST) { $env:DB_HOST } else { '127.0.0.1' }
$Port = if ($env:DB_PORT) { $env:DB_PORT } else { '5432' }
$env:PGPASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'geohazard_pass' }

if ($Restore) {
  if (-not $File) { throw '恢复请指定 -File backups\xxx.dump' }
  $path = if ([IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $Root $File }
  Write-Host "Restore $path -> ${HostName}:${Port}/$Db" -ForegroundColor Yellow
  & pg_restore --clean --if-exists -h $HostName -p $Port -U $User -d $Db $path
  Write-Host 'Restore done' -ForegroundColor Green
  exit 0
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$out = Join-Path $BackupDir "geohazard_$stamp.dump"
Write-Host "Backup ${HostName}:${Port}/$Db -> $out" -ForegroundColor Cyan
& pg_dump -Fc -h $HostName -p $Port -U $User -d $Db -f $out
Write-Host "OK: $out" -ForegroundColor Green
