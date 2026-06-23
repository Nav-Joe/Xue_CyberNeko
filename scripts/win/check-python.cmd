@echo off
rem 检测系统 Python 3.10+（调用前当前目录应为项目根）

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Python。
  echo        桌宠 TTS 需要 Python 3.10 或更高版本。
  echo        请安装并勾选「Add python.exe to PATH」：
  echo        https://www.python.org/downloads/
  exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 (
  for /f "delims=" %%V in ('python --version 2^>^&1') do echo [错误] 当前 %%V — 需要 Python 3.10+
  exit /b 1
)

for /f "delims=" %%V in ('python --version 2^>^&1') do echo [通过] %%V
exit /b 0
