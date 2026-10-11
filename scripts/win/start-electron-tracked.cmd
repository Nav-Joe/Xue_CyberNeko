@echo off
setlocal EnableExtensions

cd /d "%~dp0..\.."

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-electron-tracked.ps1"
if errorlevel 1 (
  echo [错误] 无法启动 Electron 开发进程。
  exit /b 1
)

exit /b 0
