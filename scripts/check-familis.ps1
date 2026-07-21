$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$PidFile = Join-Path $RuntimeDir "port-forward.pid"

Push-Location $Root
try {
  Write-Host "Kubernetes context:"
  kubectl config current-context
  Write-Host ""

  Write-Host "Nodes:"
  kubectl get nodes
  Write-Host ""

  Write-Host "Pods:"
  kubectl -n familis get pods
  Write-Host ""

  Write-Host "Services:"
  kubectl -n familis get svc
  Write-Host ""

  Write-Host "Ingress:"
  kubectl -n familis get ingress
  Write-Host ""

  if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
      Write-Host "Port-forward: running with PID $pidValue"
    } else {
      Write-Host "Port-forward: PID file exists, but process is not running"
    }
  } else {
    Write-Host "Port-forward: not started by scripts"
  }
} finally {
  Pop-Location
}
