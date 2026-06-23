@echo off

setlocal EnableExtensions

chcp 65001 >nul

title 切换 TTS 引擎



for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"

cd /d "%ROOT%"



set "PY=%ROOT%\.venv\Scripts\python.exe"

if not exist "%PY%" (

  echo [错误] 未找到 .venv，请先运行「首次安装」。

  pause

  exit /b 1

)



echo.

echo  当前引擎:

"%PY%" "%~dp0read-engine-name.py" --labeled

echo.

echo  配置文件: tts_voice\config.yaml

echo.

echo  1. qwen              公开 Qwen3 VoiceDesign（默认，支持音色工坊）

echo  2. bert_vits2        Bert-VITS2 + G_900.pth

echo  3. style_bert_vits2  Style-Bert-VITS2（需实现 engines/style_bert_vits2.py）

echo  0. 取消

echo.

set /p CHOICE=请选择 [1/2/3/0]: 



if "%CHOICE%"=="0" exit /b 0

if "%CHOICE%"=="3" goto :set_style

if "%CHOICE%"=="2" goto :set_bert

if not "%CHOICE%"=="1" (

  echo [错误] 无效选项

  pause

  exit /b 1

)



"%PY%" "%~dp0write-engine-name.py" qwen

goto :done



:set_bert

if not exist "%ROOT%\tts_voice\bert\G_900.pth" if not exist "%ROOT%\tts_voice\G_900.pth" (

  echo [警告] 未找到 bert 权重（tts_voice\bert\G_900.pth），切换后 TTS 将无法启动。

)

"%PY%" "%~dp0write-engine-name.py" bert_vits2

goto :done



:set_style

"%PY%" "%~dp0write-engine-name.py" style_bert_vits2

goto :done



:done

echo.

echo  请关闭并重新运行「启动」使 TTS 服务加载新引擎。

echo  也可直接编辑 tts_voice\config.yaml 中的 engine 字段。

echo.

pause

exit /b 0

