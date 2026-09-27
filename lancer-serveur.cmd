@echo off
setlocal

set "PROJECT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$serverDir = Join-Path $env:PROJECT_DIR 'server';" ^
  "$pidFile = Join-Path $serverDir '.server.pid';" ^
  "$scriptPath = Join-Path $serverDir 'src\index.js';" ^
  "if (Test-Path -LiteralPath $pidFile) {" ^
  "  $oldPid = [int](Get-Content -LiteralPath $pidFile -Raw);" ^
  "  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { Write-Host ('Le serveur tourne deja (PID ' + $oldPid + ').'); exit 0 };" ^
  "  Remove-Item -LiteralPath $pidFile -Force;" ^
  "};" ^
  "$node = (Get-Command node.exe -ErrorAction Stop).Source;" ^
  "$stdout = Join-Path $serverDir 'server.log';" ^
  "$stderr = Join-Path $serverDir 'server-error.log';" ^
  "$process = Start-Process -FilePath $node -ArgumentList ('\"' + $scriptPath + '\"') -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru;" ^
  "Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline;" ^
  "Start-Sleep -Milliseconds 800;" ^
  "if ($process.HasExited) { Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'Le serveur n''a pas pu demarrer. Consulte server\server-error.log.'; exit 1 };" ^
  "Write-Host ('Serveur demarre (PID ' + $process.Id + '). Logs: server\server.log')"

if errorlevel 1 pause
endlocal
