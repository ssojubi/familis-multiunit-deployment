param(
  [switch]$SkipBuild,
  [switch]$NoPortForward,
  [switch]$PublicAccess,
  [int]$Port = 5173,
  [string]$Address = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$LogDir = Join-Path $RuntimeDir "logs"
$PidFile = Join-Path $RuntimeDir "port-forward.pid"
$PortForwardLog = Join-Path $LogDir "port-forward.log"
$PortForwardErrorLog = Join-Path $LogDir "port-forward.error.log"
$ToolsDir = Join-Path $RuntimeDir "tools"
$CloudflaredExe = Join-Path $ToolsDir "cloudflared.exe"
$TunnelPidFile = Join-Path $RuntimeDir "public-tunnel.pid"
$TunnelUrlFile = Join-Path $RuntimeDir "public-url.txt"
$TunnelOutLog = Join-Path $LogDir "public-tunnel.out.log"
$TunnelErrorLog = Join-Path $LogDir "public-tunnel.error.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function New-RandomHex([int]$ByteCount = 32) {
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

function Get-KubernetesSecretValue($Name, $Key) {
  $encoded = kubectl -n familis get secret $Name --ignore-not-found -o "jsonpath={.data.$Key}"
  if ($LASTEXITCODE -ne 0 -or -not $encoded) { return $null }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

function Apply-GenericSecret($Name, [hashtable]$Values) {
  $arguments = @("-n", "familis", "create", "secret", "generic", $Name)
  foreach ($entry in $Values.GetEnumerator()) {
    $arguments += "--from-literal=$($entry.Key)=$($entry.Value)"
  }
  $arguments += @("--dry-run=client", "-o", "yaml")
  & kubectl @arguments | kubectl apply -f -
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create Kubernetes secret '$Name'."
  }
}

function Wait-Deployment($Name, $Timeout = "180s") {
  kubectl -n familis rollout status "deployment/$Name" "--timeout=$Timeout"
  if ($LASTEXITCODE -ne 0) {
    throw "Deployment '$Name' did not become ready within $Timeout."
  }
}

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

  if ($PublicAccess -and $NoPortForward) {
    throw "-PublicAccess requires the local port-forward. Remove -NoPortForward and try again."
  }

  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not running. Open Docker Desktop, wait until its engine is ready, and run this command again."
  }

  Write-Host "Checking Kubernetes..."
  kubectl get nodes | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop Kubernetes is not available. Enable Kubernetes in Docker Desktop and wait until it is running."
  }

  $traefikDeployment = kubectl -n traefik get deployment traefik --ignore-not-found -o name
  if (-not $traefikDeployment) {
    Require-Command helm
    Write-Host "Installing Traefik..."
    helm repo add traefik https://traefik.github.io/charts --force-update
    helm repo update
    helm upgrade --install traefik traefik/traefik `
      --namespace traefik `
      --create-namespace `
      --set service.type=ClusterIP `
      --set providers.kubernetesIngress.enabled=true `
      --set "additionalArguments[0]=--serversTransport.insecureSkipVerify=true" `
      --wait `
      --timeout 5m
    if ($LASTEXITCODE -ne 0) {
      throw "Traefik installation failed."
    }
  } else {
    Write-Host "Traefik is already installed."
  }

  kubectl -n traefik rollout status deployment/traefik --timeout=180s

  $metricsApi = kubectl get apiservice v1beta1.metrics.k8s.io --ignore-not-found -o name
  if (-not $metricsApi) {
    Write-Host "Installing Kubernetes Metrics Server..."
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.1/components.yaml
  }

  $metricsArgs = kubectl -n kube-system get deployment metrics-server -o jsonpath="{.spec.template.spec.containers[0].args}"
  if ($metricsArgs -notmatch "kubelet-insecure-tls") {
    kubectl -n kube-system patch deployment metrics-server `
      --type=json `
      --patch-file .\k8s\metrics-server-docker-desktop-patch.json
  }
  kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s

  $ip = Get-PrimaryIPv4
  if ($ip -eq "localhost") {
    throw "Could not detect a LAN IPv4 address. Connect this computer to the kiosk network and try again."
  }

  $certFile = Join-Path $Root "certs\cert.pem"
  $keyFile = Join-Path $Root "certs\key.pem"
  $certificateScript = Join-Path $PSScriptRoot "new-familis-certificate.ps1"
  $refreshCertificate = -not (Test-Path $certFile) -or -not (Test-Path $keyFile)

  if (-not $refreshCertificate) {
    if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
      throw "OpenSSL is required to validate the FaMiLiS LAN certificate."
    }

    & openssl x509 -in $certFile -noout -checkip $ip *> $null
    $refreshCertificate = $LASTEXITCODE -ne 0

    if (-not $refreshCertificate) {
      & openssl x509 -in $certFile -noout -checkend 86400 *> $null
      $refreshCertificate = $LASTEXITCODE -ne 0
    }
  }

  if ($refreshCertificate) {
    Write-Host "Refreshing the LAN certificate for $ip..."
    & $certificateScript -LanIP $ip
  } else {
    Write-Host "LAN certificate already covers $ip."
  }

  if (-not $SkipBuild) {
    Write-Host "Building Docker images..."
    $imageVersion = "local-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
    $centralImage = "familis-central-server:$imageVersion"
    $familisImage = "familis-app:$imageVersion"
    docker build -t $centralImage .\central-server
    if ($LASTEXITCODE -ne 0) { throw "Failed to build the central server image." }
    docker build -t $familisImage .\kiosk-image
    if ($LASTEXITCODE -ne 0) { throw "Failed to build the FaMiLiS image." }
    docker tag $centralImage familis-central-server:latest
    if ($LASTEXITCODE -ne 0) { throw "Failed to tag the central server image." }
    docker tag $familisImage familis-app:k8s
    if ($LASTEXITCODE -ne 0) { throw "Failed to tag the FaMiLiS image." }

    $nodeName = kubectl get nodes -o jsonpath="{.items[0].metadata.name}"
    $imageArchive = Join-Path $RuntimeDir "familis-images.tar"
    $nodeImageArchive = "/root/familis-images-$imageVersion.tar"
    docker save -o $imageArchive $centralImage $familisImage
    if ($LASTEXITCODE -ne 0) { throw "Failed to save Docker images." }
    docker cp $imageArchive "$nodeName`:$nodeImageArchive"
    if ($LASTEXITCODE -ne 0) { throw "Failed to copy images into the Kubernetes node." }
    docker exec $nodeName ctr -n k8s.io images import --all-platforms $nodeImageArchive
    if ($LASTEXITCODE -ne 0) { throw "Failed to import images into Kubernetes." }
    docker exec $nodeName ctr -n k8s.io images tag --force `
      "docker.io/library/$centralImage" `
      docker.io/library/familis-central-server:latest
    if ($LASTEXITCODE -ne 0) { throw "Failed to tag the central server image." }
    docker exec $nodeName ctr -n k8s.io images tag --force `
      "docker.io/library/$familisImage" `
      docker.io/library/familis-app:k8s
    if ($LASTEXITCODE -ne 0) { throw "Failed to tag the FaMiLiS image." }
    Remove-Item -LiteralPath $imageArchive -Force
  }

  Write-Host "Applying Kubernetes manifests..."
  kubectl apply -f .\k8s\base\namespace.yaml
  if ($LASTEXITCODE -ne 0) { throw "Could not create the familis namespace." }

  $mysqlPassword = Get-KubernetesSecretValue "mysql-secret" "root-password"
  if (-not $mysqlPassword) {
    $mysqlPassword = New-RandomHex 24
    Apply-GenericSecret "mysql-secret" @{
      "root-password" = $mysqlPassword
      "database" = "familis_central"
    }
  } elseif ($mysqlPassword -eq "root") {
    $replacementPassword = New-RandomHex 24
    $mysqlPod = kubectl -n familis get pod -l app=mysql -o "jsonpath={.items[0].metadata.name}" 2>$null
    if ($LASTEXITCODE -eq 0 -and $mysqlPod) {
      Write-Host "Rotating the legacy MySQL password..."
      kubectl -n familis exec $mysqlPod -- mysql -uroot -proot -e "ALTER USER IF EXISTS 'root'@'%' IDENTIFIED BY '$replacementPassword'; ALTER USER IF EXISTS 'root'@'localhost' IDENTIFIED BY '$replacementPassword';"
      if ($LASTEXITCODE -ne 0) {
        throw "Could not rotate the legacy MySQL password."
      }
    }
    $mysqlPassword = $replacementPassword
    Apply-GenericSecret "mysql-secret" @{
      "root-password" = $mysqlPassword
      "database" = "familis_central"
    }
  }

  $internalToken = Get-KubernetesSecretValue "internal-api-secret" "token"
  if (-not $internalToken -or $internalToken -eq "familis-internal-frame-ingest") {
    Apply-GenericSecret "internal-api-secret" @{
      "token" = (New-RandomHex 32)
    }
  }

  $authTokenSecret = Get-KubernetesSecretValue "familis-auth-secret" "auth-token-secret"
  if (-not $authTokenSecret) { $authTokenSecret = New-RandomHex 32 }
  if (-not (Get-KubernetesSecretValue "familis-auth-secret" "auth-token-secret")) {
    Apply-GenericSecret "familis-auth-secret" @{
      "auth-token-secret" = $authTokenSecret
    }
  }
  $credentialFile = Join-Path $RuntimeDir "admin-credentials.txt"
  @(
    "Email: admin@familis.com"
    "Password: admin123"
  ) | Set-Content -Path $credentialFile
  $testerCredentialFile = Join-Path $RuntimeDir "tester-credentials.txt"
  @(
    (1..10 | ForEach-Object { "tester$($_.ToString('00'))@familis.com" })
    "Password: Tester123!"
  ) | Set-Content -Path $testerCredentialFile

  Write-Host "Updating the TLS certificate secret..."
  kubectl -n familis create secret tls familis-tls `
    --cert=.\certs\cert.pem `
    --key=.\certs\key.pem `
    --dry-run=client `
    -o yaml | kubectl apply -f -

  kubectl -n familis delete job kafka-init --ignore-not-found | Out-Host
  kubectl apply -k .\k8s\base --validate=false
  if ($LASTEXITCODE -ne 0) { throw "Could not apply the Kubernetes manifests." }
  kubectl -n familis set env deployment/familis --containers=familis HOST_LAN_IP=$ip | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not set the LAN IP." }
  kubectl -n familis rollout restart deployment/central-api deployment/fer-worker deployment/familis | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not restart the FaMiLiS deployments." }

  Write-Host "Waiting for deployments..."
  Wait-Deployment "mysql" "300s"
  Wait-Deployment "zookeeper"
  Wait-Deployment "kafka"
  $partitionCount = kubectl -n familis exec deployment/kafka -- bash -c "kafka-topics --bootstrap-server kafka:9092 --describe --topic video-frames | sed -n 's/.*PartitionCount: \([0-9]*\).*/\1/p'"
  if ([int]$partitionCount -lt 6) {
    kubectl -n familis exec deployment/kafka -- kafka-topics --bootstrap-server kafka:9092 --alter --topic video-frames --partitions 6
  }
  Wait-Deployment "central-api"
  Wait-Deployment "fer-worker" "300s"
  Wait-Deployment "familis"

  if (-not $NoPortForward) {
    $portForwardReady = $false
    $process = $null
    if (Test-Path $PidFile) {
      $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
      $oldProcess = if ($oldPid) {
        Get-Process -Id $oldPid -ErrorAction SilentlyContinue
      }
      $oldListener = if ($oldProcess) {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $_.OwningProcess -eq $oldProcess.Id } |
          Select-Object -First 1
      }
      if ($oldProcess -and $oldListener) {
        $process = $oldProcess
        $portForwardReady = $true
        Write-Host "Reusing Traefik port-forward with PID $($oldProcess.Id)."
      } else {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
      }
    }

    if (-not $portForwardReady) {
      $listenerPids = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
      )
      if ($listenerPids.Count -gt 0) {
        throw "Port $Port is already in use by process $($listenerPids -join ', '). Stop the existing listener and run this command again."
      }

      Remove-Item -LiteralPath $PortForwardLog, $PortForwardErrorLog -Force -ErrorAction SilentlyContinue
      $kubectlPath = (Get-Command kubectl).Source
      $portForwardArgs = @(
        "-n", "traefik",
        "port-forward",
        "--address", $Address,
        "svc/traefik",
        "$Port`:443"
      )
      $process = Start-Process `
        -FilePath $kubectlPath `
        -ArgumentList $portForwardArgs `
        -WindowStyle Hidden `
        -RedirectStandardOutput $PortForwardLog `
        -RedirectStandardError $PortForwardErrorLog `
        -PassThru
      Set-Content -Path $PidFile -Value $process.Id

      for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        $process.Refresh()
        if ($process.HasExited) { break }

        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
          Where-Object { $_.OwningProcess -eq $process.Id } |
          Select-Object -First 1
        if ($listener) {
          $portForwardReady = $true
          break
        }
      }
    }

    if (-not $portForwardReady) {
      if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
      Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
      $details = @(
        Get-Content $PortForwardLog -Raw -ErrorAction SilentlyContinue
        Get-Content $PortForwardErrorLog -Raw -ErrorAction SilentlyContinue
      ) -join "`n"
      throw "The local port-forward could not start. kubectl output: $details"
    }
    Write-Host "Started Traefik port-forward with PID $($process.Id)."
  }

  $publicUrl = $null
  if ($PublicAccess) {
    Write-Warning "Public access exposes this FaMiLiS instance to anyone who has its temporary URL."

    New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
    if (-not (Test-Path $CloudflaredExe)) {
      Write-Host "Downloading the portable Cloudflare tunnel client..."
      Invoke-WebRequest `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $CloudflaredExe
    }

    if ((Test-Path $TunnelPidFile) -and (Test-Path $TunnelUrlFile)) {
      $oldTunnelPid = Get-Content $TunnelPidFile -ErrorAction SilentlyContinue
      $oldTunnelProcess = if ($oldTunnelPid) {
        Get-Process -Id $oldTunnelPid -ErrorAction SilentlyContinue
      }
      $oldPublicUrl = [string](Get-Content $TunnelUrlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
      $oldPublicUrl = $oldPublicUrl.Trim()
      if ($oldTunnelProcess -and $oldPublicUrl) {
        try {
          $health = Invoke-RestMethod -Uri "$oldPublicUrl/api/health" -TimeoutSec 15
          if ($health.ok) {
            $publicUrl = $oldPublicUrl
            Write-Host "Reusing public URL: $publicUrl"
          }
        } catch {
          $publicUrl = $null
        }
      }
    }

    if (-not $publicUrl) {
      Remove-Item -LiteralPath $TunnelPidFile, $TunnelUrlFile, $TunnelOutLog, $TunnelErrorLog -Force -ErrorAction SilentlyContinue
      $tunnelArgs = @(
        "tunnel",
        "--no-autoupdate",
        "--url", "https://127.0.0.1:$Port",
        "--no-tls-verify"
      )
      $tunnel = Start-Process `
        -FilePath $CloudflaredExe `
        -ArgumentList $tunnelArgs `
        -WindowStyle Hidden `
        -RedirectStandardOutput $TunnelOutLog `
        -RedirectStandardError $TunnelErrorLog `
        -PassThru
      Set-Content -Path $TunnelPidFile -Value $tunnel.Id

      Write-Host "Waiting for the trusted public URL..."
      for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        $tunnelOutput = @(
          Get-Content $TunnelOutLog -Raw -ErrorAction SilentlyContinue
          Get-Content $TunnelErrorLog -Raw -ErrorAction SilentlyContinue
        ) -join "`n"
        $match = [regex]::Match($tunnelOutput, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
          $publicUrl = $match.Value
          Set-Content -Path $TunnelUrlFile -Value $publicUrl
          break
        }
        if ($tunnel.HasExited) { break }
      }

      if (-not $publicUrl) {
        if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
        Remove-Item -LiteralPath $TunnelPidFile -Force -ErrorAction SilentlyContinue
        $details = Get-Content $TunnelErrorLog -Raw -ErrorAction SilentlyContinue
        throw "Could not create the public URL. Cloudflare tunnel output: $details"
      }
    }

    kubectl -n familis set env deployment/familis --containers=familis "PUBLIC_ACCESS_URL=$publicUrl" | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Could not publish the public URL to the FaMiLiS application."
    }
    Wait-Deployment "familis"
  }

  Write-Host ""
  Write-Host "FaMiLiS is running."
  if (-not $NoPortForward) {
    Write-Host "Admin laptop URL: https://localhost:$Port"
    Write-Host "Same-network device URL: https://$ip`:$Port"
    if ($publicUrl) {
      Write-Host "Public device URL: $publicUrl"
      Write-Host "No certificate installation is required for the public URL."
    }
  } else {
    Write-Host "Port-forward was skipped. Use the server IP or configured ingress URL."
  }
  Write-Host ""
  kubectl -n familis get pods
  Write-Host ""
  kubectl -n familis get ingress
} finally {
  Pop-Location
}
