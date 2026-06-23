@echo off

chcp 65001 >nul

title 雪澜赛博猫娘 - TTS 服务



cd /d "%~dp0..\.."



call "%~dp0read-tts-backend.cmd"

call "%~dp0prepare-tts-env.cmd"

if errorlevel 1 (
  echo.
  if /I "%TTS_BACKEND%"=="qwen" (
    echo 请确认已运行「首次安装.bat」，并按提示下载 Qwen3 VoiceDesign 与 Base 模型。
  ) else (
    echo 请安装 Python、放置 G_900.pth，并配置 Bert-VITS2 后重试。
    echo 或使用开发者切换脚本改回 qwen 公开引擎。
  )
  call "%~dp0exit-if-error.cmd" "TTS 环境检查失败"
)

call "%~dp0resolve-venv-python.cmd"

if not exist "%XUE_VENV_PYTHON%" (
  echo [错误] 找不到虚拟环境 Python: %XUE_VENV_PYTHON%
  call "%~dp0exit-if-error.cmd" "找不到虚拟环境 Python"
)



echo.

echo ========================================

echo   TTS 服务  http://127.0.0.1:8000

echo   后端: %TTS_BACKEND%

echo   Python: %XUE_VENV_PYTHON%

if /I "%TTS_BACKEND%"=="bert_vits2" echo   BERT_VITS2_ROOT=%BERT_VITS2_ROOT%

echo   关闭本窗口将停止语音服务

echo ========================================

echo.



"%XUE_VENV_PYTHON%" tts_voice\tts_server.py
call "%~dp0exit-if-error.cmd" "TTS 服务异常退出"
exit /b %ERRORLEVEL%

