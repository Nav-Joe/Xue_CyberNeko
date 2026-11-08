@echo off
rem 根据脚本位置解析 .venv\Scripts\python.exe，写入 XUE_VENV_PYTHON（无 setlocal，供调用方使用）
rem 已经指向一个存在的解释器时不覆盖。环境页会传入数据根；首次安装不传，仍用脚本上两级。
if defined XUE_VENV_PYTHON if exist "%XUE_VENV_PYTHON%" exit /b 0

if defined XUE_DATA_ROOT (
  set "XUE_VENV_PYTHON=%XUE_DATA_ROOT%\.venv\Scripts\python.exe"
  exit /b 0
)

for %%I in ("%~dp0..\..") do set "XUE_VENV_PYTHON=%%~fI\.venv\Scripts\python.exe"
exit /b 0
