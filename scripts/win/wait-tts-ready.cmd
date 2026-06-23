@echo off
setlocal EnableExtensions
chcp 65001 >nul

rem 等待 TTS 完成模型 + BERT 预热后再启动 Electron/Vite
rem 调用前当前目录必须是项目根目录

set "TIMEOUT_SEC=300"
set "INTERVAL_SEC=2"

echo [提示] 等待 TTS 加载模型、预热并生成触摸语音缓存（语料变更后首次较慢）...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(%TIMEOUT_SEC%);" ^
  "while ((Get-Date) -lt $deadline) {" ^
  "  try {" ^
  "    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3;" ^
  "    if ($r.ready -eq $true) { exit 0 }" ^
  "  } catch {}" ^
  "  Start-Sleep -Seconds %INTERVAL_SEC%" ^
  "}" ^
  "exit 1"

if errorlevel 1 (
  echo [警告] TTS 在 %TIMEOUT_SEC% 秒内未就绪，仍将启动主程序（首次点击可能较慢）
  exit /b 1
)

echo [完成] TTS 已就绪。
exit /b 0
