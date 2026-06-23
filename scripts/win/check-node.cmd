@echo off
where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  echo        请先安装 Node.js 20+ 并确保已加入 PATH。
  echo        下载: https://nodejs.org/
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请检查 Node.js 安装是否完整。
  exit /b 1
)

exit /b 0
