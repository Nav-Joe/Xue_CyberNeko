@echo off

rem 读取 TTS 引擎名到 TTS_BACKEND（供 bat 脚本判断依赖）

rem 优先级：TTS_ENGINE / TTS_BACKEND 环境变量 > tts_voice\config.yaml > qwen



if defined TTS_ENGINE (

  set "TTS_BACKEND=%TTS_ENGINE%"

  exit /b 0

)

if defined TTS_BACKEND exit /b 0



if defined TTS_BACKEND exit /b 0

set "TTS_BACKEND="

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

set "PY=%ROOT%\.venv\Scripts\python.exe"

set "ENGINE_TMP=%TEMP%\xue_tts_engine_%RANDOM%.txt"

if exist "%PY%" (

  rem 勿在调用 Python 前预设 TTS_BACKEND=qwen，否则子进程会读到环境变量而忽略 config.yaml

  "%PY%" "%~dp0read-engine-name.py" > "%ENGINE_TMP%" 2>nul

  if exist "%ENGINE_TMP%" (

    set /p TTS_BACKEND=<"%ENGINE_TMP%"

    del "%ENGINE_TMP%" >nul 2>&1

  )

)

if not defined TTS_BACKEND set "TTS_BACKEND=qwen"



if /I "%TTS_BACKEND%"=="bert" set "TTS_BACKEND=bert_vits2"

if /I "%TTS_BACKEND%"=="bert-vits2" set "TTS_BACKEND=bert_vits2"

if /I "%TTS_BACKEND%"=="style" set "TTS_BACKEND=style_bert_vits2"

if /I not "%TTS_BACKEND%"=="bert_vits2" if /I not "%TTS_BACKEND%"=="style_bert_vits2" set "TTS_BACKEND=qwen"

exit /b 0

