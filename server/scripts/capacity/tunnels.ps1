param(
  [string]$HostAlias = "ktga-vps",
  [int]$Count = 10,
  [int]$FirstPort = 4120,
  [int]$RemotePort = 4103
)
$ErrorActionPreference = "Stop"
if ($Count -lt 1 -or $Count -gt 32 -or $FirstPort -lt 1024 -or $FirstPort + $Count -gt 65535 -or $RemotePort -lt 1024 -or $RemotePort -gt 65535 -or $RemotePort -eq 4000 -or $HostAlias -notmatch '^[a-zA-Z0-9._-]+$') { throw "Invalid private tunnel configuration" }
$processes = @()
try {
  $targets = @()
  for ($i = 0; $i -lt $Count; $i++) {
    $port = $FirstPort + $i
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port already in use" }
    $process = Start-Process ssh -WindowStyle Hidden -PassThru -ArgumentList @("-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-L", "127.0.0.1:${port}:127.0.0.1:${RemotePort}", $HostAlias)
    $processes += $process
    $targets += "http://127.0.0.1:$port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 150; $attempt++) {
      if ($process.HasExited) { throw "SSH tunnel for port $port failed" }
      if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
      Start-Sleep -Milliseconds 100
    }
    if (-not $ready) { throw "SSH tunnel for port $port did not start" }
  }
  Start-Sleep -Seconds 3
  foreach ($process in $processes) { if ($process.HasExited) { throw "SSH tunnel failed" } }
  Write-Output ($targets -join ",")
  while ($true) {
    foreach ($process in $processes) { if ($process.HasExited) { throw "SSH tunnel stopped" } }
    Start-Sleep -Seconds 1
  }
} finally {
  foreach ($process in $processes) { if (-not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
}
