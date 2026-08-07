@echo off
rem Download SenseVoice int8 into .runtime\stt-models\ (~230MB extracted; ~160MB archive).
rem Call from repo root.

setlocal EnableExtensions

call "%~dp0check-stt-models.cmd"
if not errorlevel 1 (
  echo [跳过] SenseVoice STT 模型权重已齐全。
  exit /b 0
)

echo.
echo [提示] 下载 SenseVoice int8（sherpa-onnx，约 160MB 压缩包）...
echo        目标: .runtime\stt-models\
echo.

call "%~dp0check-disk-space.cmd" 1
if errorlevel 1 exit /b 1

call "%~dp0resolve-venv-python.cmd"
set "PY=%XUE_VENV_PYTHON%"

if not exist "%PY%" (
  echo [错误] 找不到虚拟环境 Python: %PY%
  echo        请先完成 .venv 创建与 STT pip 依赖安装。
  exit /b 1
)

"%PY%" "%~dp0download-stt-models.py"
if errorlevel 1 (
  echo [错误] SenseVoice 下载失败。可手动:
  echo   "%PY%" "%~dp0download-stt-models.py"
  echo   或从 GitHub asr-models 下载 tar.bz2 解压到 .runtime\stt-models\
  exit /b 1
)

call "%~dp0check-stt-models.cmd"
if errorlevel 1 (
  echo [错误] 下载后校验失败，请检查 .runtime\stt-models\
  exit /b 1
)

echo [完成] SenseVoice STT 模型已就绪。
exit /b 0
