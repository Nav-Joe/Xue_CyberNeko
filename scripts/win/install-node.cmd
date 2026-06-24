@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0ensure-system-path.cmd"
chcp 65001 >nul 2>&1

call "%~dp0runtime-versions.cmd"

echo.
echo [提示] 未检测到 Node.js，将自动安装 Node.js %XUE_NODE_VERSION%
echo        官方 OpenJS 发行版，安装后会加入 PATH
echo.

where winget >nul 2>&1
if not errorlevel 1 (
  echo [提示] 使用 winget 安装 %XUE_NODE_PACKAGE_ID% %XUE_NODE_VERSION% ...
  winget install --id %XUE_NODE_PACKAGE_ID% --version %XUE_NODE_VERSION% --accept-package-agreements --accept-source-agreements --disable-interactivity
  if not errorlevel 1 goto :done
  echo [警告] winget 安装 Node.js 失败，尝试下载官方安装包 ...
)

set "SETUP_DIR=%TEMP%\xue-cyber-neko-setup"
set "MSI=%SETUP_DIR%\node-v%XUE_NODE_VERSION%-x64.msi"
if not exist "%SETUP_DIR%" mkdir "%SETUP_DIR%" >nul 2>&1

echo [提示] 正在下载 %XUE_NODE_MSI_URL%
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%XUE_NODE_MSI_URL%' -OutFile '%MSI%' -UseBasicParsing; if (-not (Test-Path '%MSI%')) { exit 1 }"
if errorlevel 1 (
  echo [错误] Node.js 安装包下载失败，请手动安装 Node.js %XUE_NODE_MIN_MAJOR%+ 并加入 PATH：
  echo        https://nodejs.org/
  exit /b 1
)

echo [提示] 正在静默安装 Node.js ...
"%SystemRoot%\System32\msiexec.exe" /i "%MSI%" /qn /norestart ADDLOCAL=ALL
if errorlevel 1 (
  echo [错误] Node.js 静默安装失败。请手动运行安装包：%MSI%
  exit /b 1
)

:done
call "%~dp0refresh-shell-path.cmd"
exit /b 0
