@echo off
rem 从 tts_voice\config.yaml 解析 bert_vits2 的 model / config / root 路径

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

set "PY=%ROOT%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  where python >nul 2>&1
  if errorlevel 1 (
    echo [警告] 未找到 Python，无法读取 tts_voice\config.yaml 中的 bert 路径。
    exit /b 1
  )
  set "PY=python"
)

set "BERT_ENV_TMP=%TEMP%\xue_bert_env_%RANDOM%.txt"
"%PY%" "%~dp0read-bert-env.py" > "%BERT_ENV_TMP%" 2>nul
if not exist "%BERT_ENV_TMP%" (
  echo [警告] 无法读取 bert_vits2 配置，请检查 tts_voice\config.yaml。
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%BERT_ENV_TMP%") do (
  if /I "%%A"=="MODEL_PATH" set "BERT_MODEL_PATH=%%B"
  if /I "%%A"=="CONFIG_PATH" set "BERT_CONFIG_PATH=%%B"
  if /I "%%A"=="BERT_ROOT" set "BERT_VITS2_ROOT=%%B"
)
del "%BERT_ENV_TMP%" >nul 2>&1

if not defined BERT_MODEL_PATH (
  echo [警告] config.yaml 中未解析到 bert_vits2.model_path。
  exit /b 1
)

if not exist "%BERT_MODEL_PATH%" (
  echo [警告] 未找到模型权重: %BERT_MODEL_PATH%
  echo        请在 config.yaml 的 engines.bert_vits2.model_path 中填写正确路径。
  exit /b 1
)

if not defined BERT_CONFIG_PATH (
  echo [警告] config.yaml 中未解析到 bert_vits2.config_path。
  exit /b 1
)

if not exist "%BERT_CONFIG_PATH%" (
  echo [警告] 未找到 config.json: %BERT_CONFIG_PATH%
  echo        请在 config.yaml 的 engines.bert_vits2.config_path 中填写正确路径。
  exit /b 1
)

if not defined BERT_VITS2_ROOT (
  echo [警告] config.yaml 中未解析到 bert_vits2.root（Bert-VITS2 源码目录）。
  exit /b 1
)

if not exist "%BERT_VITS2_ROOT%\infer.py" (
  echo [警告] Bert-VITS2 源码目录无效: %BERT_VITS2_ROOT%
  echo        root 应指向含 infer.py 的 Bert-VITS2 仓库，而非仅放权重的文件夹。
  echo        请 git clone https://github.com/fishaudio/Bert-VITS2 到项目根或修改 engines.bert_vits2.root。
  exit /b 1
)

exit /b 0
