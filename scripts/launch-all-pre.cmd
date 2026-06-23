@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0.."

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

if not exist "node_modules\" (
  echo.
  echo [提示] 未检测到 node_modules，正在执行 npm install ...
  echo.
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "public\live2d\live2dcubismcore.min.js" (
  echo.
  echo [提示] 正在补全 Cubism Core ...
  call node scripts\ensure-cubism-core.js
  if errorlevel 1 exit /b 1
)

call "%~dp0win\prompt-live2d-model.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\prepare-tts-env.cmd"
rem TTS 环境未就绪时不阻断桌宠启动

exit /b 0
