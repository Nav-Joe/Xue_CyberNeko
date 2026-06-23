@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 安装 Bert-VITS2 v2.3

cd /d "%~dp0.."

where git >nul 2>&1
if errorlevel 1 (
  echo [错误] 需要 Git 才能克隆 Bert-VITS2
  pause
  exit /b 1
)

if not exist "Bert-VITS2\" (
  echo.
  echo [1/4] 克隆 Bert-VITS2（仅推理用，不含你的训练数据）...
  git clone --depth 1 https://github.com/fishaudio/Bert-VITS2.git Bert-VITS2
  if errorlevel 1 (
    echo [错误] git clone 失败
    pause
    exit /b 1
  )
  cd Bert-VITS2
  git fetch --depth 1 origin 76653b5b6d657143721df2ed6c5c246b4b1d9277
  git checkout 76653b5b6d657143721df2ed6c5c246b4b1d9277
  cd ..
) else (
  echo [跳过] Bert-VITS2 目录已存在
)

echo.
echo [2/4] 固定 v2.3 提交并写入推理用 config.yml ...
cd Bert-VITS2
git fetch --depth 1 origin 76653b5b6d657143721df2ed6c5c246b4b1d9277 2>nul
git checkout 76653b5b6d657143721df2ed6c5c246b4b1d9277 2>nul
cd ..
if not exist "Bert-VITS2\config.yml" copy /y "Bert-VITS2\default_config.yml" "Bert-VITS2\config.yml" >nul

echo.
echo [2b/4] 中文推理补丁 + 仅保留中文 BERT 清单 ...
call "%~dp0win\patch-bert-vits2-zh-infer.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$j='Bert-VITS2/bert/bert_models.json'; $o=@{ 'chinese-roberta-wwm-ext-large'=@{ repo_id='hfl/chinese-roberta-wwm-ext-large'; files=@('pytorch_model.bin') } }; $o | ConvertTo-Json -Depth 4 | Set-Content -Path $j -Encoding UTF8"

echo.
echo [3/4] 安装 .venv 推理依赖 ...
call "%~dp0win\prepare-tts-env.cmd"
if errorlevel 1 (
  echo [警告] Python 环境未完全就绪
)

echo.
echo [4/4] 下载中文 BERT（首次约 1.2GB）...
call "%~dp0win\download-chinese-bert.cmd"
if errorlevel 1 (
  echo [警告] BERT 下载失败，TTS 首次启动时仍会重试
)

echo.
echo [完成] Bert-VITS2 v2.3 已安装到 Bert-VITS2\
echo        你的语音权重仍在 tts_voice\G_900.pth
echo.
pause
exit /b 0
