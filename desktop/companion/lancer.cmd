@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Installez Node.js 22 ou plus recent depuis https://nodejs.org/
  pause
  exit /b 1
)
node "%~dp0discord-presence.mjs" %*
if errorlevel 1 pause
