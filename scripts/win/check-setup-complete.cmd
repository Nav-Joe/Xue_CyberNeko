@echo off
rem 返回 0 = 首次安装已完成；1 = 仍需安装
rem 调用前当前目录必须是项目根

if not exist "node_modules\" exit /b 1

if not exist ".venv\Scripts\python.exe" exit /b 1

call "%~dp0resolve-venv-python.cmd"
if not exist "%XUE_VENV_PYTHON%" exit /b 1

"%XUE_VENV_PYTHON%" -c "import soundfile, fastapi, uvicorn, qwen_tts, torch" >nul 2>&1
if errorlevel 1 exit /b 1

call "%~dp0check-qwen-models.cmd"
if errorlevel 1 exit /b 1

where nvidia-smi >nul 2>&1
if errorlevel 1 exit /b 0

"%XUE_VENV_PYTHON%" -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
exit /b %ERRORLEVEL%
