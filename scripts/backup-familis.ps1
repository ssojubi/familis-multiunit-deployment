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
  kubectl -n familis exec $pod -- sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot familis_central' |
    Set-Content -Path $backupFile -Encoding utf8
  if ($LASTEXITCODE -ne 0) {
    throw "MySQL backup failed. Check the MySQL pod and credentials."
  }
  Write-Host "Backup written to: $backupFile"
} finally {
  Pop-Location
}
