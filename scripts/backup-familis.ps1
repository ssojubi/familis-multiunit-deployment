param(
  [string]$OutputDir = ".familis\backups"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $Root $OutputDir
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BackupDir "familis-mysql-$timestamp.sql"

Push-Location $Root
try {
  $pod = kubectl -n familis get pod -l app=mysql -o jsonpath="{.items[0].metadata.name}"
  if (-not $pod) {
    throw "No MySQL pod found in namespace 'familis'."
  }

  Write-Host "Backing up MySQL from pod $pod..."
  kubectl -n familis exec $pod -- mysqldump -uroot -proot familis_central | Set-Content -Path $backupFile -Encoding utf8
  Write-Host "Backup written to: $backupFile"
} finally {
  Pop-Location
}
