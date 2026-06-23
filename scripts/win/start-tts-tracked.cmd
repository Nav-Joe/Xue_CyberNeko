@echo off
setlocal EnableExtensions

cd /d "%~dp0..\.."

rem 依赖检查由 launch-all-pre.cmd 完成，此处不再重复
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-tts-tracked.ps1"
if errorlevel 1 (
  echo [错误] 无法启动 TTS 窗口（桌宠仍可运行，但无语音）。
  exit /b 1
)

exit /b 0
