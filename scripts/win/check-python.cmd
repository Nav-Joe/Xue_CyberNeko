@echo off
rem 检测 Python 3.10+；仅当 XUE_AUTO_INSTALL_RUNTIME=1 时自动安装（首次安装.bat）
call "%~dp0ensure-system-path.cmd"
call "%~dp0runtime-versions.cmd"
call "%~dp0refresh-shell-path.cmd"

where python >nul 2>&1
if errorlevel 1 if /I "%XUE_AUTO_INSTALL_RUNTIME%"=="1" (
  call "%~dp0install-python.cmd"
  if errorlevel 1 exit /b 1
  call "%~dp0refresh-shell-path.cmd"
)

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+。
  echo        请先运行「首次安装.bat」，或从 https://www.python.org/downloads/ 安装并勾选 Add to PATH。
  exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (%XUE_PYTHON_MIN_MAJOR%, %XUE_PYTHON_MIN_MINOR%) else 1)" >nul 2>&1
if errorlevel 1 (
  for /f "delims=" %%V in ('python --version 2^>^&1') do echo [错误] 当前 %%V — 需要 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+
  echo        请升级 Python 或运行「首次安装.bat」。
  exit /b 1
)

for /f "delims=" %%V in ('python --version 2^>^&1') do echo [通过] Python %%V
exit /b 0
