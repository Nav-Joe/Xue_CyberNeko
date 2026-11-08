@echo off
rem 返回 0 = 必要环境已齐（运行时 + Live2D 模型）；1 = 仍需首次安装
rem 调用前当前目录必须是项目根
rem 本地 TTS / STT / Qwen 权重不是必要项，改到桌宠设置「环境」里安装。

if not exist "node_modules\" exit /b 1

if not exist ".venv\Scripts\python.exe" exit /b 1

call "%~dp0resolve-venv-python.cmd"
if not exist "%XUE_VENV_PYTHON%" exit /b 1

call "%~dp0check-live2d-model.cmd"
if errorlevel 1 exit /b 1

exit /b 0
