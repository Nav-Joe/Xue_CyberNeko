@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 雪澜赛博猫娘 - 开发 + TTS

cd /d "%~dp0.."

call "%~dp0win\check-single-instance.cmd"
if errorlevel 1 (
  exit /b 1
)

node "%~dp0app-instance-lock.js" launching

call "%~dp0win\check-node.cmd"
if errorlevel 1 (
  call "%~dp0win\exit-if-error.cmd" "Node.js 检查失败"
)

call "%~dp0launch-all-pre.cmd"
if errorlevel 1 (
  call "%~dp0win\exit-if-error.cmd" "启动前检查失败"
)

call "%~dp0win\stop-tts.cmd"

set "TTS_STARTED=0"
call "%~dp0win\start-tts-tracked.cmd"
if not errorlevel 1 set "TTS_STARTED=1"

if "%TTS_STARTED%"=="0" (
  echo [提示] TTS 未启动，点击猫娘时将无法朗读。
  echo.
) else (
  call "%~dp0win\wait-tts-ready.cmd"
  if errorlevel 1 echo.
)

echo.
echo ========================================
echo   雪澜赛博猫娘 - 运行中
if "%TTS_STARTED%"=="1" echo   结束运行后 TTS 窗口会自动关闭
echo ========================================
echo.

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

node "%~dp0app-instance-lock.js" clear

echo.
if "%TTS_STARTED%"=="1" (
  echo [提示] 正在关闭 TTS 服务...
  call "%~dp0win\stop-tts.cmd"
)

if not "%EXIT_CODE%"=="0" (
  call "%~dp0win\exit-if-error.cmd" "运行异常退出" %EXIT_CODE%
)

exit /b %EXIT_CODE%
