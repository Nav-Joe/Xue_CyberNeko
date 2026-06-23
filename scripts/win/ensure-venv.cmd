@echo off
rem 调用前当前目录应为项目根；若无 .venv 则创建

call "%~dp0resolve-venv-python.cmd"

if exist "%XUE_VENV_PYTHON%" goto :ready

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到系统 Python 3.10+，无法创建虚拟环境。
  echo        请安装 Python 并勾选「Add to PATH」。
  exit /b 1
)

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

echo.
echo [提示] 正在创建项目虚拟环境 .venv
echo        路径: %ROOT%\.venv
echo        后续 Python 依赖只装在此目录，不会写入系统 Python。
echo.

python -m venv "%ROOT%\.venv"
if errorlevel 1 (
  echo [错误] 创建 .venv 失败。
  exit /b 1
)

call "%~dp0resolve-venv-python.cmd"

:ready
if not exist "%XUE_VENV_PYTHON%" (
  echo [错误] 虚拟环境 Python 不存在: %XUE_VENV_PYTHON%
  exit /b 1
)

exit /b 0
