@echo off
rem Call from repo root. STT pip deps into root .venv; model weights are NOT downloaded here.
rem See stt_service\README.md for SenseVoice layout under .runtime\stt-models\

call "%~dp0resolve-venv-python.cmd"
set "PY=%XUE_VENV_PYTHON%"

call "%~dp0ensure-venv.cmd"
if errorlevel 1 exit /b 1

call "%~dp0resolve-venv-python.cmd"
set "PY=%XUE_VENV_PYTHON%"

if not exist "%PY%" (
  echo [错误] 找不到虚拟环境 Python: %PY%
  exit /b 1
)

"%PY%" -c "import sherpa_onnx, fastapi, uvicorn, numpy, multipart" >nul 2>&1
if not errorlevel 1 (
  echo [完成] STT Python 依赖已在 .venv 中就绪。
  exit /b 0
)

echo.
echo [提示] 正在向 .venv 安装 STT 依赖（stt_service\requirements.txt）...
echo.

"%PY%" -m pip install -U pip
"%PY%" -m pip install -r "stt_service\requirements.txt"
if errorlevel 1 (
  echo [错误] STT pip 安装失败。可手动执行:
  echo        "%PY%" -m pip install -r stt_service\requirements.txt
  exit /b 1
)

"%PY%" -c "import sherpa_onnx, fastapi, uvicorn, numpy, multipart" >nul 2>&1
if errorlevel 1 (
  echo [错误] STT 依赖安装后仍无法 import（sherpa_onnx / multipart 等）。
  exit /b 1
)

echo [完成] STT Python 依赖已在 .venv 中就绪。
exit /b 0
