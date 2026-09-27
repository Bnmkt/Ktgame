param(
  [string]$Domain = "ktgapi.netdis.org",
  [string]$Email = "",
  [string]$ExpectedIp = "94.106.131.148",
  [ValidateSet("http-01", "tls-alpn-01")]
  [string]$ValidationMode = "http-01"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Lance PowerShell en administrateur pour ouvrir le port 80 et permettre la validation Let's Encrypt."
  }
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $line = "$Key=$Value"
  if (-not (Test-Path $Path)) {
    Set-Content -Path $Path -Value $line -Encoding UTF8
    return
  }

  $content = Get-Content -Path $Path
  $found = $false
  $updated = $content | ForEach-Object {
    if ($_ -match "^$([regex]::Escape($Key))=") {
      $found = $true
      $line
    } else {
      $_
    }
  }

  if (-not $found) {
    $updated += $line
  }

  Set-Content -Path $Path -Value $updated -Encoding UTF8
}

Assert-Admin

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$certDir = Join-Path $repoRoot "certs"
$toolsDir = Join-Path $repoRoot "tools"
$wacsDir = Join-Path $toolsDir "win-acme"
$envPath = Join-Path $repoRoot ".env"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$resolvedIps = @(Resolve-DnsName $Domain -Type A -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress)
if ($ExpectedIp -and ($resolvedIps -notcontains $ExpectedIp)) {
  throw "$Domain ne pointe pas vers $ExpectedIp. IP trouvee(s): $($resolvedIps -join ', ')"
}

$validationPort = if ($ValidationMode -eq "tls-alpn-01") { 443 } else { 80 }
$firewallName = if ($ValidationMode -eq "tls-alpn-01") { "KTGA Let's Encrypt TLS-ALPN-01" } else { "KTGA Let's Encrypt HTTP-01" }
Write-Host "Ouverture du port $validationPort pour la validation Let's Encrypt..."
New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $validationPort -ErrorAction SilentlyContinue | Out-Null

if (-not (Test-Path (Join-Path $wacsDir "wacs.exe"))) {
  Write-Host "Telechargement de win-acme..."
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/win-acme/win-acme/releases/latest" -Headers @{ "User-Agent" = "KTGA-setup" }
  $asset = $release.assets |
    Where-Object { $_.name -like "win-acme.v*.x64.trimmed.zip" } |
    Select-Object -First 1

  if (-not $asset) {
    throw "Impossible de trouver l'archive win-acme x64 dans la derniere release."
  }

  $zipPath = Join-Path $toolsDir $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
  if (Test-Path $wacsDir) {
    Remove-Item -LiteralPath $wacsDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $wacsDir | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $wacsDir -Force
}

$wacs = Join-Path $wacsDir "wacs.exe"
$args = @(
  "--source", "manual",
  "--host", $Domain,
  "--validation", "selfhosting",
  "--validationmode", $ValidationMode,
  "--store", "pemfiles",
  "--pemfilespath", $certDir,
  "--pemfilesname", $Domain,
  "--installation", "none",
  "--accepttos"
)

if ($Email) {
  $args += @("--emailaddress", $Email)
}

Write-Host "Demande du certificat Let's Encrypt pour $Domain..."
& $wacs @args
if ($LASTEXITCODE -ne 0) {
  throw "win-acme a echoue avec le code $LASTEXITCODE."
}

$keyPath = Join-Path $certDir "$Domain-key.pem"
$chainPath = Join-Path $certDir "$Domain-chain.pem"

if (-not (Test-Path $keyPath) -or -not (Test-Path $chainPath)) {
  throw "Certificat genere incomplet. Fichiers attendus: $keyPath et $chainPath"
}

Set-EnvValue -Path $envPath -Key "HTTPS_KEY_PATH" -Value "./certs/$Domain-key.pem"
Set-EnvValue -Path $envPath -Key "HTTPS_CERT_PATH" -Value "./certs/$Domain-chain.pem"

Write-Host ""
Write-Host "Certificat public installe."
Write-Host "HTTPS_KEY_PATH=./certs/$Domain-key.pem"
Write-Host "HTTPS_CERT_PATH=./certs/$Domain-chain.pem"
Write-Host "Relance ensuite: npm start"
