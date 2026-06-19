@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 雪澜赛博猫娘 - TTS 服务

cd /d "%~dp0.."

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Python。TTS 服务需要 Python 3.10+
  pause
  exit /b 1
)

if not defined BERT_VITS2_ROOT (
  if exist "Bert-VITS2\" (
    set "BERT_VITS2_ROOT=%CD%\Bert-VITS2"
  ) else (
    echo [提示] 未设置 BERT_VITS2_ROOT，且项目下没有 Bert-VITS2 文件夹。
    echo        请克隆 https://github.com/fishaudio/Bert-VITS2
    echo        并设置: set BERT_VITS2_ROOT=你的路径
    echo.
  )
)

if not exist "tts_voice\G_900.pth" (
  echo [错误] 未找到 tts_voice\G_900.pth
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Bert-VITS2 TTS  http://127.0.0.1:8000
echo   BERT_VITS2_ROOT=%BERT_VITS2_ROOT%
echo   关闭本窗口将停止语音服务
echo ========================================
echo.

python tts_voice\tts_server.py
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  call "%~dp0win\pause-on-error.cmd" "TTS 服务异常退出（代码 %EXIT_CODE%）"
)

exit /b %EXIT_CODE%
