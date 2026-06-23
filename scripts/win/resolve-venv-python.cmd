@echo off
rem 根据脚本位置解析 .venv\Scripts\python.exe，写入 XUE_VENV_PYTHON（无 setlocal，供调用方使用）
for %%I in ("%~dp0..\..") do set "XUE_VENV_PYTHON=%%~fI\.venv\Scripts\python.exe"
exit /b 0
