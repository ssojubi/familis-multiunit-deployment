param(
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
  Write-Host "Kubernetes context:"
  kubectl config current-context
  Write-Host ""

  Write-Host "Nodes:"
  kubectl get nodes
  Write-Host ""

  Write-Host "Pods:"
  kubectl -n familis get pods
  Write-Host ""

  Write-Host "FER autoscaling:"
  kubectl -n familis get hpa fer-worker
  Write-Host ""

  Write-Host "Services:"
  kubectl -n familis get svc
  Write-Host ""

  Write-Host "Ingress:"
  kubectl -n familis get ingress
  Write-Host ""

  Write-Host "Traefik:"
  kubectl -n traefik get pods
  kubectl -n traefik get svc
  kubectl get ingressclass traefik
  Write-Host ""

  if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
      Write-Host "Traefik port-forward: running with PID $pidValue"
    } else {
      Write-Host "Traefik port-forward: PID file exists, but process is not running"
    }
  } else {
    $manualListeners = @(
      Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
    if ($manualListeners.Count -gt 0) {
      Write-Host "Traefik port-forward: manual listener on port $Port with PID $($manualListeners -join ', ')"
    } else {
      Write-Host "Traefik port-forward: not running"
    }
  }

  if (Test-Path $TunnelPidFile) {
    $tunnelPid = Get-Content $TunnelPidFile -ErrorAction SilentlyContinue
    if ($tunnelPid -and (Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)) {
      $publicUrl = Get-Content $TunnelUrlFile -ErrorAction SilentlyContinue
      Write-Host "Public tunnel: running with PID $tunnelPid"
      if ($publicUrl) { Write-Host "Public URL: $publicUrl" }
    } else {
      Write-Host "Public tunnel: PID file exists, but process is not running"
    }
  } else {
    Write-Host "Public tunnel: not started"
  }
} finally {
  Pop-Location
}
