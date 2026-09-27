@echo off
setlocal

set "PROJECT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$serverDir = Join-Path $env:PROJECT_DIR 'server';" ^
  "$pidFile = Join-Path $serverDir '.server.pid';" ^
  "$scriptPath = Join-Path $serverDir 'src\index.js';" ^
  "if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'Le serveur est deja arrete.'; exit 0 };" ^
  "$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw);" ^
  "$processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serverPid) -ErrorAction SilentlyContinue;" ^
  "if (-not $processInfo) { Remove-Item -LiteralPath $pidFile -Force; Write-Host 'Le serveur etait deja arrete.'; exit 0 };" ^
  "if ($processInfo.Name -notlike 'node*' -or $processInfo.CommandLine -notlike ('*' + $scriptPath + '*')) { Write-Host 'Arret annule: le PID appartient a un autre processus.'; exit 1 };" ^
  "Stop-Process -Id $serverPid -Force;" ^
  "Remove-Item -LiteralPath $pidFile -Force;" ^
  "Write-Host 'Serveur arrete.'"

if errorlevel 1 pause
endlocal
