[CmdletBinding(SupportsShouldProcess = $true)]
param()

function Get-CasinoServerProcesses {
    param([string]$ServerDir, [object[]]$Processes, [int[]]$VerifiedListenerIds = @())
    $entry = (Join-Path $ServerDir 'src\index.js').Replace('\', '/')
    $absoluteEntry = '(?i)(?:^|[\s"''])' + [regex]::Escape($entry) + '(?=$|[\s"''])'
    $relativeEntry = '(?i)(?:^|[\s"''])(?:\./)?(?:server/)?src/index\.js(?=$|[\s"''])'
    foreach ($process in $Processes) {
        if ($process.Name -ne 'node.exe') { continue }
        $command = [string]$process.CommandLine
        $normalized = $command.Replace('\', '/')
        if ($normalized -match $absoluteEntry -or ($VerifiedListenerIds -contains [int]$process.ProcessId -and $normalized -match $relativeEntry)) {
            $process
        }
    }
}

function Test-CasinoHealth {
    param([int]$Port, [string]$BasePath)
    foreach ($scheme in @('https', 'http')) {
        try {
            # Only probe loopback. curl supports the local development certificate on Windows PowerShell 5.
            $response = & curl.exe --silent --insecure --max-time 3 --noproxy '*' "$($scheme)://127.0.0.1:$Port$BasePath/api/health" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $health = $response | ConvertFrom-Json -ErrorAction Stop
                if ($health.ok -eq $true -and $health.service -eq 'ktga-me-server') { return $true }
            }
        } catch { continue }
    }
    return $false
}

if ($MyInvocation.InvocationName -eq '.') { return }
$ErrorActionPreference = 'Stop'
$serverDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $serverDir '.server.pid'
$port = 4000
$basePath = ''
$envFile = Join-Path $serverDir '.env'
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*PORT\s*=\s*["'']?(\d+)') { $port = [int]$Matches[1] }
        if ($line -match '^\s*APP_BASE_PATH\s*=\s*(.*)$') { $basePath = $Matches[1].Trim().Trim('"', "'").TrimEnd('/') }
    }
}
if ($env:PORT -match '^\d+$') { $port = [int]$env:PORT }
if ($null -ne $env:APP_BASE_PATH) { $basePath = $env:APP_BASE_PATH.TrimEnd('/') }
if ($port -lt 1 -or $port -gt 65535) { throw 'Port serveur invalide.' }

$processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'")
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$verifiedIds = @()
if ($listeners.Count -gt 0 -and (Test-CasinoHealth -Port $port -BasePath $basePath)) { $verifiedIds = $listeners }
$candidates = @(Get-CasinoServerProcesses -ServerDir $serverDir -Processes $processes -VerifiedListenerIds $verifiedIds)

$stopped = 0
foreach ($candidate in $candidates) {
    $current = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $candidate.ProcessId) -ErrorAction SilentlyContinue
    if (-not $current) { continue }
    if ($current.CreationDate -ne $candidate.CreationDate -or $current.CommandLine -ne $candidate.CommandLine) { throw 'Le processus a change pendant la verification. Relance le script.' }
    if ($PSCmdlet.ShouldProcess("Serveur casino (PID $($candidate.ProcessId))", 'Forcer l''arret')) {
        Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop
        Wait-Process -Id $candidate.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
        $stopped++
    }
}
if ($WhatIfPreference) { return }
if (Test-Path -LiteralPath $pidFile) {
    $recordedId = 0
    $validId = [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$recordedId)
    if ($validId -and (Get-Process -Id $recordedId -ErrorAction SilentlyContinue) -and $stopped -eq 0) {
        Write-Warning 'Le PID enregistre appartient a un processus non confirme : aucun autre programme ne sera arrete.'
    } else { Remove-Item -LiteralPath $pidFile -Force }
}
if ($stopped) { Write-Host "Serveur arrete ($stopped processus)." }
elseif ($listeners.Count -gt 0) { Write-Warning 'Aucun serveur casino confirme. Le port est utilise ; aucun autre programme n''a ete arrete.'; exit 1 }
else { Write-Host 'Le serveur est deja arrete.' }
