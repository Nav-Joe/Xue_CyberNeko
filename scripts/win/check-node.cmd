@echo off
rem 检测 Node.js 20+；仅当 XUE_AUTO_INSTALL_RUNTIME=1 时自动安装（首次安装.bat）
call "%~dp0ensure-system-path.cmd"
call "%~dp0runtime-versions.cmd"
call "%~dp0refresh-shell-path.cmd"

where node >nul 2>&1
if errorlevel 1 if /I "%XUE_AUTO_INSTALL_RUNTIME%"=="1" (
  call "%~dp0install-node.cmd"
  if errorlevel 1 exit /b 1
  call "%~dp0refresh-shell-path.cmd"
)

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js %XUE_NODE_MIN_MAJOR%+。
  echo        请先运行「首次安装.bat」，或从 https://nodejs.org/ 安装并加入 PATH。
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请检查 Node.js 安装是否完整。
  exit /b 1
)

node -e "const m=+(process.version.match(/^v(\d+)/)||[])[1]; process.exit(m>=%XUE_NODE_MIN_MAJOR%?0:1)" >nul 2>&1
if errorlevel 1 (
  for /f "delims=" %%V in ('node --version 2^>^&1') do echo [错误] 当前 %%V — 需要 Node.js %XUE_NODE_MIN_MAJOR%+
  echo        请从 https://nodejs.org/ 升级，或运行「首次安装.bat」。
  exit /b 1
)

for /f "delims=" %%V in ('node --version 2^>^&1') do echo [通过] Node.js %%V
exit /b 0
