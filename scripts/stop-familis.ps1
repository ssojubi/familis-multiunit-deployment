param(
  [switch]$DeleteNamespace,
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$PidFile = Join-Path $RuntimeDir "port-forward.pid"
$TunnelPidFile = Join-Path $RuntimeDir "public-tunnel.pid"
$TunnelUrlFile = Join-Path $RuntimeDir "public-url.txt"

Push-Location $Root
try {
  if (Test-Path $TunnelPidFile) {
    $tunnelPid = Get-Content $TunnelPidFile -ErrorAction SilentlyContinue
    if ($tunnelPid -and (Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $tunnelPid -Force
      Write-Host "Stopped public tunnel process $tunnelPid."
    }
    Remove-Item -LiteralPath $TunnelPidFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $TunnelUrlFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "No script-managed public tunnel found."
  }

  kubectl -n familis set env deployment/familis --containers=familis PUBLIC_ACCESS_URL- *> $null

  if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
      Stop-Process -Id $pidValue -Force
      Write-Host "Stopped Traefik port-forward process $pidValue."
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "No script-managed Traefik port-forward process found."
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
