@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 安装 PyTorch（按 GPU 自动选择 CUDA 版本）

cd /d "%~dp0.."

call "%~dp0win\ensure-venv.cmd"
if errorlevel 1 (
  pause
  exit /b 1
)

call "%~dp0win\resolve-venv-python.cmd"
set "PY=%XUE_VENV_PYTHON%"

echo.
echo [提示] 检测 GPU 并安装匹配的 PyTorch（无 GPU 则装 CPU 版）...
echo.

set "TORCH_ARGS="
if /I "%~1"=="--force" set "TORCH_ARGS=--force"

"%PY%" "%~dp0win\detect-and-install-torch.py" %TORCH_ARGS%
if errorlevel 1 (
  echo.
  echo [错误] PyTorch 安装失败。
  pause
  exit /b 1
)

echo.
echo [完成] PyTorch 已就绪。
echo.
pause
exit /b 0
