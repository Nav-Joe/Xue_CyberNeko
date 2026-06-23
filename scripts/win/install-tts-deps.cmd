@echo off
rem 调用前当前目录必须是项目根目录

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

rem 依赖已齐且 PyTorch 可用时静默跳过（避免启动/TTS 窗口重复刷屏）
"%PY%" -c "import soundfile, fastapi, uvicorn, scipy, qwen_tts, torch" >nul 2>&1
if errorlevel 1 goto :install_base_deps
where nvidia-smi >nul 2>&1
if errorlevel 1 exit /b 0
"%PY%" -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
if not errorlevel 1 exit /b 0
goto :install_torch

:install_base_deps
echo.
echo [提示] 正在向 .venv 安装 TTS 依赖（tts_voice\requirements.txt）...
echo.

"%PY%" -m pip install -U pip
"%PY%" -m pip install -r "tts_voice\requirements.txt"
if errorlevel 1 (
  echo [错误] pip 安装失败。可手动执行:
  echo        "%PY%" -m pip install -r tts_voice\requirements.txt
  exit /b 1
)

:install_torch
echo.
echo [提示] 安装/校验 PyTorch（按 GPU 架构自动选择 CUDA 版本）...
echo.

"%PY%" "%~dp0detect-and-install-torch.py"
if errorlevel 1 (
  echo [警告] PyTorch 自动安装失败，TTS / Qwen3 可能无法使用 GPU。
)

:install_qwen
"%PY%" -c "import qwen_tts" >nul 2>&1
if not errorlevel 1 goto :check_bert_vits2

echo.
echo [提示] 正在向 .venv 安装 Qwen3-TTS（qwen-tts + modelscope）...
echo.

"%PY%" -m pip install -U qwen-tts modelscope
if errorlevel 1 (
  echo [警告] Qwen3-TTS 依赖安装失败，试听请重新运行「首次安装」。
)

:check_bert_vits2
if not exist "Bert-VITS2\" goto :done

call "%~dp0patch-bert-vits2-zh-infer.cmd" >nul 2>&1

"%PY%" -c "import jieba, transformers, huggingface_hub" >nul 2>&1
if not errorlevel 1 goto :done

echo.
echo [提示] 检测到本地 Bert-VITS2\，正在安装私有引擎推理依赖...
echo        来源: tts_voice\requirements-bert-vits2-infer.txt
echo.

"%PY%" -m pip install -r "tts_voice\requirements-bert-vits2-infer.txt" huggingface_hub
if errorlevel 1 (
  echo [警告] Bert-VITS2 推理依赖安装失败，若私有 TTS 报错请手动 pip install。
)

:done
if not exist "Bert-VITS2\config.yml" (
  if exist "Bert-VITS2\default_config.yml" (
    copy /y "Bert-VITS2\default_config.yml" "Bert-VITS2\config.yml" >nul
  )
)
"%PY%" -c "import soundfile" >nul 2>&1
if errorlevel 1 (
  echo [错误] soundfile 仍未安装成功。
  exit /b 1
)

echo [完成] Python 依赖已在 .venv 中就绪。
exit /b 0
