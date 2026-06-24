@echo off



call "%~dp0check-python.cmd"
if errorlevel 1 exit /b 1

call "%~dp0read-tts-backend.cmd"



if /I "%TTS_BACKEND%"=="qwen" goto :check_qwen
if /I "%TTS_BACKEND%"=="style_bert_vits2" goto :install_deps

call "%~dp0resolve-bert-paths.cmd"
if errorlevel 1 exit /b 1

goto :install_deps



:check_qwen

if not exist "Qwen3_TTS\models\Qwen3-TTS-12Hz-1.7B-VoiceDesign\config.json" (

  echo [警告] 未找到 Qwen3 VoiceDesign 模型。

  echo        请先运行「首次安装.bat」或 scripts\win\check-qwen-models.cmd 下载到 Qwen3_TTS\models\

  exit /b 1

)

if not exist "Qwen3_TTS\models\Qwen3-TTS-12Hz-1.7B-Base\config.json" (

  echo [警告] 未找到 Qwen3 Base 克隆模型（自定义语料预热需要）。

  echo        请运行「首次安装.bat」或 scripts\win\install-qwen-models.cmd 下载 Base 1.7B。

  exit /b 1

)



:install_deps

call "%~dp0ensure-venv.cmd"

if errorlevel 1 exit /b 1



call "%~dp0install-tts-deps.cmd"

if errorlevel 1 exit /b 1



exit /b 0

