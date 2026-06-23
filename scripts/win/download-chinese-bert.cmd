@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0..\.."

call "%~dp0resolve-venv-python.cmd"
set "PY=%XUE_VENV_PYTHON%"

if not exist "Bert-VITS2\" (
  echo [错误] 未找到 Bert-VITS2 目录，请自行 clone fishaudio/Bert-VITS2 到项目根。
  exit /b 1
)

if not exist "Bert-VITS2\config.yml" (
  copy /y "Bert-VITS2\default_config.yml" "Bert-VITS2\config.yml" >nul
)

set "HF_ENDPOINT=https://hf-mirror.com"

echo.
echo [提示] 下载中文 RoBERTa 到 Bert-VITS2\bert\（约 1.2GB，首次需要）...
echo.

"%PY%" -c "import os; os.chdir('Bert-VITS2'); from text import check_bert_models; check_bert_models()"
if errorlevel 1 (
  echo [错误] BERT 下载失败。可设置 HF_ENDPOINT 或手动下载 hfl/chinese-roberta-wwm-ext-large
  exit /b 1
)

echo [完成] 中文 BERT 已就绪。
exit /b 0
