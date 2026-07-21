param(
  [string]$LanIP,
  [int]$Days = 365,
  [switch]$ResetCA
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$CertDir = Join-Path $Root "certs"
$CertFile = Join-Path $CertDir "cert.pem"
$KeyFile = Join-Path $CertDir "key.pem"
$DerFile = Join-Path $CertDir "familis-ca.cer"
$RootCertFile = Join-Path $CertDir "familis-root-ca.pem"
$RootKeyFile = Join-Path $CertDir "familis-root-ca-key.pem"
$CsrFile = Join-Path $CertDir "familis-server.csr"

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  throw "OpenSSL is required to generate the FaMiLiS LAN certificate."
}

if (-not $LanIP) {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric |
    Select-Object -First 1
  $address = if ($route) {
    Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike "169.254.*" } |
      Select-Object -First 1
  }
  $LanIP = $address.IPAddress
}

$parsedIP = $null
if (-not [Net.IPAddress]::TryParse($LanIP, [ref]$parsedIP)) {
  throw "A valid LAN IPv4 address is required. Received '$LanIP'."
}

New-Item -ItemType Directory -Force -Path $CertDir | Out-Null

if ($ResetCA -or -not (Test-Path $RootCertFile) -or -not (Test-Path $RootKeyFile)) {
  & openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 3650 `
    -keyout $RootKeyFile `
    -out $RootCertFile `
    -subj "/CN=FaMiLiS Local Root CA" `
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" `
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  if ($LASTEXITCODE -ne 0) { throw "OpenSSL root CA generation failed." }
}

& openssl req -new -nodes -newkey rsa:3072 -sha256 `
  -keyout $KeyFile `
  -out $CsrFile `
  -subj "/CN=$LanIP" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LanIP" `
  -addext "basicConstraints=critical,CA:FALSE" `
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" `
  -addext "extendedKeyUsage=serverAuth"
if ($LASTEXITCODE -ne 0) { throw "OpenSSL server key generation failed." }

$serialBytes = New-Object byte[] 16
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($serialBytes)
$random.Dispose()
$serial = ($serialBytes | ForEach-Object { $_.ToString("x2") }) -join ""

& openssl x509 -req `
  -in $CsrFile `
  -CA $RootCertFile `
  -CAkey $RootKeyFile `
  -set_serial "0x$serial" `
  -days $Days `
  -sha256 `
  -copy_extensions copy `
  -out $CertFile
if ($LASTEXITCODE -ne 0) { throw "OpenSSL certificate signing failed." }

Remove-Item -LiteralPath $CsrFile -Force -ErrorAction SilentlyContinue

& openssl x509 -in $RootCertFile -outform der -out $DerFile
if ($LASTEXITCODE -ne 0) { throw "Could not create the iPad certificate file." }

Copy-Item $CertFile (Join-Path $Root "central-server\cert.pem") -Force
Copy-Item $KeyFile (Join-Path $Root "central-server\key.pem") -Force
Copy-Item $CertFile (Join-Path $Root "kiosk-image\FaMiLiS\cert.pem") -Force
Copy-Item $KeyFile (Join-Path $Root "kiosk-image\FaMiLiS\key.pem") -Force

Write-Host "Generated a FaMiLiS server certificate for localhost and $LanIP."
Write-Host "Install certs\familis-ca.cer once on each iPad, then enable full trust for it."
