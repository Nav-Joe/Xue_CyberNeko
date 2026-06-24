@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0ensure-system-path.cmd"
chcp 65001 >nul 2>&1

call "%~dp0runtime-versions.cmd"

echo.
echo [提示] 未检测到 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+，将自动安装 Python %XUE_PYTHON_VERSION%
echo        官方 PSF 发行版，安装时会加入 PATH
echo.

where winget >nul 2>&1
if not errorlevel 1 (
  echo [提示] 使用 winget 安装 %XUE_PYTHON_PACKAGE_ID% %XUE_PYTHON_VERSION% ...
  winget install --id %XUE_PYTHON_PACKAGE_ID% --version %XUE_PYTHON_VERSION% --accept-package-agreements --accept-source-agreements --disable-interactivity
  if not errorlevel 1 goto :done
  echo [警告] winget 安装 Python 失败，尝试下载官方安装包 ...
)

set "SETUP_DIR=%TEMP%\xue-cyber-neko-setup"
set "INSTALLER=%SETUP_DIR%\python-%XUE_PYTHON_VERSION%-amd64.exe"
if not exist "%SETUP_DIR%" mkdir "%SETUP_DIR%" >nul 2>&1

echo [提示] 正在下载 %XUE_PYTHON_EXE_URL%
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%XUE_PYTHON_EXE_URL%' -OutFile '%INSTALLER%' -UseBasicParsing; if (-not (Test-Path '%INSTALLER%')) { exit 1 }"
if errorlevel 1 (
  echo [错误] Python 安装包下载失败，请手动安装 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+ 并加入 PATH：
  echo        https://www.python.org/downloads/
  exit /b 1
)

echo [提示] 正在静默安装 Python ...
"%INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0 Include_pip=1
if errorlevel 1 (
  echo [错误] Python 静默安装失败。请手动运行安装包：%INSTALLER%
  exit /b 1
)

:done
call "%~dp0refresh-shell-path.cmd"
exit /b 0
