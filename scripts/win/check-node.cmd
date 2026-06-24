@echo off
rem 检测 Node.js 20+；缺失时自动安装（见 runtime-versions.cmd 锁定版本）
call "%~dp0runtime-versions.cmd"

call "%~dp0refresh-shell-path.cmd"

where node >nul 2>&1
if errorlevel 1 (
  call "%~dp0install-node.cmd"
  if errorlevel 1 exit /b 1
  call "%~dp0refresh-shell-path.cmd"
  where node >nul 2>&1
  if errorlevel 1 (
    echo [错误] Node.js 安装后仍未出现在 PATH 中。
    echo        请关闭本窗口后重新打开「首次安装.bat」，或手动安装 Node.js %XUE_NODE_MIN_MAJOR%+。
    exit /b 1
  )
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请检查 Node.js 安装是否完整。
  exit /b 1
)

node -e "const m=+(process.version.match(/^v(\d+)/)||[])[1]; process.exit(m>=%XUE_NODE_MIN_MAJOR%?0:1)" >nul 2>&1
if errorlevel 1 (
  for /f "delims=" %%V in ('node --version 2^>^&1') do echo [错误] 当前 %%V — 需要 Node.js %XUE_NODE_MIN_MAJOR%+
  echo        请从 https://nodejs.org/ 升级，或卸载旧版后重新运行首次安装。
  exit /b 1
)

for /f "delims=" %%V in ('node --version 2^>^&1') do echo [通过] Node.js %%V
exit /b 0
