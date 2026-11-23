# Opens Grafana and/or the public Cloudflare URL for an already-running FaMiLiS deployment,
# in the background, so no extra PowerShell windows have to stay open.
#
#   .\scripts\open-familis-access.ps1            # Grafana and the public URL
#   .\scripts\open-familis-access.ps1 -Grafana   # Grafana only
#   .\scripts\open-familis-access.ps1 -Public    # public Cloudflare URL only
#   .\scripts\open-familis-access.ps1 -Stop      # stop what this script started
#
# .\scripts\stop-familis.ps1 also stops everything started here.
param(
  [switch]$Grafana,
  [switch]$Public,
  [switch]$Stop,
  [int]$GrafanaPort = 3000,
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".familis"
$LogDir = Join-Path $RuntimeDir "logs"
$GrafanaPidFile = Join-Path $RuntimeDir "grafana-port-forward.pid"
$PortForwardPidFile = Join-Path $RuntimeDir "port-forward.pid"
$TunnelPidFile = Join-Path $RuntimeDir "public-tunnel.pid"
$TunnelUrlFile = Join-Path $RuntimeDir "public-url.txt"
$TunnelLog = Join-Path $LogDir "public-tunnel.error.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if (-not $Grafana -and -not $Public) { $Grafana = $true; $Public = $true }

function Stop-FromPidFile($File, $Label) {
  if (-not (Test-Path $File)) { return }
  $id = Get-Content $File -ErrorAction SilentlyContinue
  if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $id -Force
    Write-Host "Stopped $Label (PID $id)."
  }
  Remove-Item -LiteralPath $File -Force -ErrorAction SilentlyContinue
}

function Test-Listening([int]$LocalPort) {
  [bool](Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue)
}

function Test-FamilisHealth([string]$Url) {
  try {
    # Windows PowerShell 5.1 has no -SkipCertificateCheck; curl.exe ships with Windows 10/11.
    $body = & curl.exe -sk -m 5 "$Url/api/health" 2>$null
    return [bool]($body -match '"ok":\s*true')
  } catch { return $false }
}

if ($Stop) {
  Stop-FromPidFile $GrafanaPidFile "Grafana port-forward"
  Stop-FromPidFile $TunnelPidFile "Cloudflare tunnel"
  Remove-Item -LiteralPath $TunnelUrlFile -Force -ErrorAction SilentlyContinue
  kubectl -n familis set env deployment/familis --containers=familis PUBLIC_ACCESS_URL- *> $null
  Write-Host "Public URL cleared from the application."
  return
}

if ($Grafana) {
  $service = kubectl -n monitoring get service monitoring-grafana --ignore-not-found -o name
  if (-not $service) {
    throw "Grafana is not installed on this cluster. Install it first: see monitoring/README.md, step 1."
  }
  $running = (Test-Path $GrafanaPidFile) -and (Get-Process -Id (Get-Content $GrafanaPidFile) -ErrorAction SilentlyContinue)
  if (-not $running) {
    if (Test-Listening $GrafanaPort) {
      throw "Port $GrafanaPort is already in use. Run again with -GrafanaPort 3300."
    }
    # Loopback only: Grafana must not be reachable from the network or the tunnel.
    $pf = Start-Process kubectl -WindowStyle Hidden -PassThru `
      -ArgumentList "-n", "monitoring", "port-forward", "--address", "127.0.0.1", "service/monitoring-grafana", "$($GrafanaPort):80" `
      -RedirectStandardOutput (Join-Path $LogDir "grafana-port-forward.log") `
      -RedirectStandardError (Join-Path $LogDir "grafana-port-forward.error.log")
    Set-Content -Path $GrafanaPidFile -Value $pf.Id
    for ($i = 0; $i -lt 20 -and -not (Test-Listening $GrafanaPort); $i++) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-Listening $GrafanaPort)) {
      throw "Grafana port-forward did not start. See .familis\logs\grafana-port-forward.error.log"
    }
  }
  $encoded = kubectl -n monitoring get secret monitoring-grafana -o "jsonpath={.data.admin-password}"
  $password = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
  Write-Host ""
  Write-Host "Grafana:  http://localhost:$GrafanaPort   (user: admin   password: $password)"
  Write-Host "  Test Day Overview: http://localhost:$GrafanaPort/d/familis-test-overview"
  Write-Host "  Stress Test:       http://localhost:$GrafanaPort/d/familis-stress-test/familis-stress-test"
  Write-Host "  Keep the password out of reports and screenshots."
}

if ($Public) {
  # Cloudflare Quick Tunnels need api.trycloudflare.com and *.argotunnel.com. Some networks
  # (school/office Wi-Fi) reset those connections; detect that up front with a clear message.
  & curl.exe -s -m 10 -o NUL https://api.trycloudflare.com/ 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "This network blocks Cloudflare Quick Tunnels (api.trycloudflare.com is unreachable). Connect this computer to a phone hotspot or another network and run this again."
  }

  # Where Traefik is reachable locally: Docker Desktop exposes it on 443 (LoadBalancer);
  # otherwise use (or start) the Traefik port-forward that start-familis.ps1 uses.
  $origin = $null
  if (Test-FamilisHealth "https://127.0.0.1") { $origin = "https://127.0.0.1:443" }
  elseif (Test-FamilisHealth "https://127.0.0.1:$Port") { $origin = "https://127.0.0.1:$Port" }
  else {
    if (Test-Listening $Port) { throw "Port $Port is in use but does not serve FaMiLiS. Stop that process and try again." }
    $tf = Start-Process kubectl -WindowStyle Hidden -PassThru `
      -ArgumentList "-n", "traefik", "port-forward", "--address", "0.0.0.0", "svc/traefik", "$($Port):443" `
      -RedirectStandardOutput (Join-Path $LogDir "port-forward.log") `
      -RedirectStandardError (Join-Path $LogDir "port-forward.error.log")
    Set-Content -Path $PortForwardPidFile -Value $tf.Id
    for ($i = 0; $i -lt 20 -and -not (Test-FamilisHealth "https://127.0.0.1:$Port"); $i++) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-FamilisHealth "https://127.0.0.1:$Port")) { throw "FaMiLiS is not reachable. Run .\scripts\check-familis.ps1." }
    $origin = "https://127.0.0.1:$Port"
  }

  $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  foreach ($candidate in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe", (Join-Path $RuntimeDir "tools\cloudflared.exe"))) {
    if (-not $cloudflared -and (Test-Path $candidate)) { $cloudflared = $candidate }
  }
  if (-not $cloudflared) {
    throw "cloudflared is not installed. Install it with: winget install --id Cloudflare.cloudflared"
  }

  Stop-FromPidFile $TunnelPidFile "previous Cloudflare tunnel"
  Remove-Item -LiteralPath $TunnelLog -Force -ErrorAction SilentlyContinue
  Write-Warning "The public URL lets anyone who has it reach this FaMiLiS login page until you stop it."
  $tunnel = Start-Process $cloudflared -WindowStyle Hidden -PassThru `
    -ArgumentList "tunnel", "--no-autoupdate", "--url", $origin, "--no-tls-verify" `
    -RedirectStandardOutput (Join-Path $LogDir "public-tunnel.out.log") -RedirectStandardError $TunnelLog
  Set-Content -Path $TunnelPidFile -Value $tunnel.Id

  $publicUrl = $null
  for ($i = 0; $i -lt 40 -and -not $publicUrl; $i++) {
    Start-Sleep -Seconds 1
    $log = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
    # Skip api.trycloudflare.com, which also appears in cloudflared's error messages.
    $match = [regex]::Matches([string]$log, 'https://[a-z0-9-]+\.trycloudflare\.com') | Where-Object { $_.Value -ne "https://api.trycloudflare.com" } | Select-Object -First 1
    if ($match) { $publicUrl = $match.Value }
    if ($tunnel.HasExited) { break }
  }
  if (-not $publicUrl) {
    Stop-FromPidFile $TunnelPidFile "Cloudflare tunnel"
    throw "Cloudflare did not issue a public URL. Details: .familis\logs\public-tunnel.error.log"
  }
  Set-Content -Path $TunnelUrlFile -Value $publicUrl

  Write-Host "Waiting for $publicUrl to come online..."
  $online = $false
  for ($i = 0; $i -lt 30 -and -not $online; $i++) { Start-Sleep -Seconds 2; $online = Test-FamilisHealth $publicUrl }
  if (-not $online) { Write-Warning "The tunnel started but $publicUrl is not answering yet; it can take up to a minute." }

  kubectl -n familis set env deployment/familis --containers=familis "PUBLIC_ACCESS_URL=$publicUrl" | Out-Null
  kubectl -n familis rollout status deployment/familis --timeout=180s | Out-Null
  Write-Host ""
  Write-Host "Public URL: $publicUrl   (also shown under Manage Kiosks; no certificate needed on phones)"
  Write-Host "Live video between devices still needs a network that allows direct WebRTC (no TURN relay)."
}

Write-Host ""
Write-Host "Stop with: .\scripts\open-familis-access.ps1 -Stop   (or .\scripts\stop-familis.ps1)"
