param(
  [switch]$SkipBuild,
  [switch]$NoPortForward,
  [int]$Port = 5173,
  [string]$Address = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$LogDir = Join-Path $RuntimeDir "logs"
$PidFile = Join-Path $RuntimeDir "port-forward.pid"
$PortForwardLog = Join-Path $LogDir "port-forward.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Get-PrimaryIPv4 {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric |
    Select-Object -First 1
  if (-not $route) { return "localhost" }

  $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1
  if ($ip) { return $ip.IPAddress }
  return "localhost"
}

Push-Location $Root
try {
  Require-Command docker
  Require-Command kubectl

  Write-Host "Checking Kubernetes..."
  kubectl get nodes | Out-Host

  $ip = Get-PrimaryIPv4

  if (-not $SkipBuild) {
    Write-Host "Building Docker images..."
    docker build -t familis-central-server:latest .\central-server
    docker build -t familis-app:k8s .\kiosk-image
  }

  Write-Host "Applying Kubernetes manifests..."
  kubectl apply -f .\k8s\base\namespace.yaml

  Write-Host "Updating the TLS certificate secret..."
  kubectl -n familis create secret tls familis-tls `
    --cert=.\certs\cert.pem `
    --key=.\certs\key.pem `
    --dry-run=client `
    -o yaml | kubectl apply -f -

  kubectl apply -k .\k8s\base --validate=false
  kubectl -n familis set env deployment/familis HOST_LAN_IP=$ip | Out-Host
  kubectl -n familis rollout restart deployment/familis | Out-Host

  Write-Host "Waiting for deployments..."
  kubectl -n familis rollout status deployment/mysql --timeout=180s
  kubectl -n familis rollout status deployment/zookeeper --timeout=180s
  kubectl -n familis rollout status deployment/kafka --timeout=180s
  kubectl -n familis rollout status deployment/central-api --timeout=180s
  kubectl -n familis rollout status deployment/fer-worker --timeout=180s
  kubectl -n familis rollout status deployment/familis --timeout=180s

  if (-not $NoPortForward) {
    if (Test-Path $PidFile) {
      $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
      if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $oldPid -Force
      }
      Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }

    $listenerPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($listenerPid in $listenerPids) {
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }

    $args = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "kubectl -n familis port-forward --address $Address svc/familis-web $Port`:443 *> `"$PortForwardLog`""
    )
    $process = Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru
    Set-Content -Path $PidFile -Value $process.Id
    Start-Sleep -Seconds 2
    Write-Host "Started port-forward with PID $($process.Id)."
  }

  Write-Host ""
  Write-Host "FaMiLiS is running."
  if (-not $NoPortForward) {
    Write-Host "Admin laptop URL: https://localhost:$Port"
    Write-Host "Same-network device URL: https://$ip`:$Port"
    Write-Host "If same-network devices cannot connect, check Windows Firewall or Wi-Fi client isolation."
  } else {
    Write-Host "Port-forward was skipped. Use the server IP or configured ingress URL."
  }
  Write-Host ""
  kubectl -n familis get pods
} finally {
  Pop-Location
}
