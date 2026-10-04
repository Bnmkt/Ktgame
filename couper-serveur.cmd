@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\scripts\stop-server.ps1"

if errorlevel 1 pause
endlocal
