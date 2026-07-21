param(
  [switch]$DeleteNamespace,
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$PidFile = Join-Path $RuntimeDir "port-forward.pid"

Push-Location $Root
try {
  if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $pidValue -Force
      Write-Host "Stopped port-forward process $pidValue."
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "No script-managed port-forward process found."
  }

  $listenerPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($listenerPid in $listenerPids) {
    Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped listener $listenerPid on port $Port."
  }

  if ($DeleteNamespace) {
    kubectl delete namespace familis --ignore-not-found
    Write-Host "Deleted Kubernetes namespace 'familis'."
  } else {
    Write-Host "Kubernetes workloads are still running. Use -DeleteNamespace to remove them."
  }
} finally {
  Pop-Location
}
