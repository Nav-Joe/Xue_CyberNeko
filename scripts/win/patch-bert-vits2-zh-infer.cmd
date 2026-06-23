@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0..\.."

if not exist "Bert-VITS2\text\cleaner.py" (
  echo [跳过] 未找到 Bert-VITS2\text\cleaner.py
  exit /b 0
)

findstr /C:"CURRENT_VERSIONS" "Bert-VITS2\infer.py" >nul 2>&1
if not errorlevel 1 (
  echo [跳过] Bert-VITS2 中文推理补丁已应用
  exit /b 0
)

echo [提示] 应用 Bert-VITS2 中文推理补丁（避免加载 EN/JP 模块）...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-bert-vits2-zh-infer.ps1"
if errorlevel 1 (
  echo [警告] 补丁脚本失败，TTS 可能卡在 NLTK/英文 BERT 下载
  exit /b 1
)

echo [完成] Bert-VITS2 中文推理补丁已应用。
exit /b 0
