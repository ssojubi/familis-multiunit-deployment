# Run in an elevated PowerShell session to allow kiosk devices on the LAN
# to reach the FaMiLiS Vite dev server (5173) and API server (8080).

$rules = @(
  @{ Name = "FaMiLiS Vite Dev (5173)"; Port = 5173 },
  @{ Name = "FaMiLiS API Server (8080)"; Port = 8080 }
)

foreach ($rule in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule `
      -DisplayName $rule.Name `
      -Enabled True `
      -Profile Private,Public,Domain | Out-Null
    $existing | Get-NetFirewallAddressFilter |
      Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet | Out-Null
    Write-Host "Updated firewall rule: $($rule.Name)"
    continue
  }
  New-NetFirewallRule `
    -DisplayName $rule.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $rule.Port `
    -Profile Private,Public,Domain `
    -RemoteAddress LocalSubnet | Out-Null
  Write-Host "Created firewall rule: $($rule.Name)"
}

Write-Host "Done. Kiosk devices on the same network can now reach ports 5173 and 8080."
