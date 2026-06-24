@echo off
rem 检测 Python 3.10+；缺失时自动安装并加入 PATH（见 runtime-versions.cmd 锁定版本）
call "%~dp0runtime-versions.cmd"

call "%~dp0refresh-shell-path.cmd"

where python >nul 2>&1
if errorlevel 1 (
  call "%~dp0install-python.cmd"
  if errorlevel 1 exit /b 1
  call "%~dp0refresh-shell-path.cmd"
  where python >nul 2>&1
  if errorlevel 1 (
    echo [错误] Python 安装后仍未出现在 PATH 中。
    echo        请关闭本窗口后重新打开「首次安装.bat」，或手动安装 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+ 并勾选 Add to PATH。
    exit /b 1
  )
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (%XUE_PYTHON_MIN_MAJOR%, %XUE_PYTHON_MIN_MINOR%) else 1)" >nul 2>&1
if errorlevel 1 (
  for /f "delims=" %%V in ('python --version 2^>^&1') do echo [错误] 当前 %%V — 需要 Python %XUE_PYTHON_MIN_MAJOR%.%XUE_PYTHON_MIN_MINOR%+
  echo        请从 https://www.python.org/downloads/ 升级后重试。
  exit /b 1
)

for /f "delims=" %%V in ('python --version 2^>^&1') do echo [通过] Python %%V
exit /b 0
