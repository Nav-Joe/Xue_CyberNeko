@echo off
setlocal EnableExtensions
call "%~dp0win\ensure-system-path.cmd"
chcp 65001 >nul 2>&1
title 雪澜赛博猫娘 - 开发 + TTS

cd /d "%~dp0.."

call "%~dp0win\check-single-instance.cmd"
if errorlevel 1 (
  call "%~dp0win\exit-if-error.cmd" "无法启动"
  exit /b 1
)

node "%~dp0app-instance-lock.js" launching

call "%~dp0launch-all-pre.cmd"
if errorlevel 1 (
  node "%~dp0app-instance-lock.js" clear
  call "%~dp0win\exit-if-error.cmd" "启动前检查失败"
  exit /b 1
)

call "%~dp0win\stop-tts.cmd"

rem 1) 先起 Electron → 环境检完即可出加载窗
call "%~dp0win\start-electron-tracked.cmd"
if errorlevel 1 (
  node "%~dp0app-instance-lock.js" clear
  call "%~dp0win\exit-if-error.cmd" "Electron 启动失败"
  exit /b 1
)

echo [提示] 等待桌宠加载窗就绪…
node "%~dp0app-instance-lock.js" wait-app 180000
if errorlevel 1 (
  echo [WARN] 等待加载窗超时，仍继续尝试启动 TTS。
)

rem 2) 加载窗已出后再起 TTS（与 Live2D 加载并行）
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
echo   加载窗出现后会并行拉起 TTS；关闭桌宠后本窗口会收尾
if "%TTS_STARTED%"=="1" echo   结束运行后 TTS 窗口会自动关闭
echo ========================================
echo.

call "%~dp0win\wait-electron-tracked.cmd"
set "EXIT_CODE=%ERRORLEVEL%"

node "%~dp0app-instance-lock.js" clear

echo.
if "%TTS_STARTED%"=="1" (
  echo [提示] 正在关闭 TTS 服务...
  call "%~dp0win\stop-tts.cmd"
)

if not "%EXIT_CODE%"=="0" (
  call "%~dp0win\exit-if-error.cmd" "运行异常退出" %EXIT_CODE%
  exit /b %EXIT_CODE%
)

exit /b %EXIT_CODE%
