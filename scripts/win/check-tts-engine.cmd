@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 检查 TTS 引擎配置

cd /d "%~dp0..\.."

echo.
echo ===== TTS 引擎诊断 =====
echo.

set "HAS_ENV_OVERRIDE=0"
if defined TTS_ENGINE (
  echo [环境变量] TTS_ENGINE=%TTS_ENGINE% ^(会覆盖 config.yaml^)
  set "HAS_ENV_OVERRIDE=1"
)
if defined TTS_BACKEND (
  echo [环境变量] TTS_BACKEND=%TTS_BACKEND% ^(会覆盖 config.yaml^)
  set "HAS_ENV_OVERRIDE=1"
)
if defined BERT_VITS2_ROOT (
  echo [环境变量] BERT_VITS2_ROOT=%BERT_VITS2_ROOT%
)
if "%HAS_ENV_OVERRIDE%"=="0" (
  echo [环境变量] 未检测到 TTS_ENGINE / TTS_BACKEND 覆盖
)

echo.
echo [config.yaml]
set "PY=%CD%\.venv\Scripts\python.exe"
if exist "%PY%" (
  "%PY%" "%~dp0read-engine-name.py" --labeled
) else (
  echo   ^(.venv 不存在，无法读取^)
)

echo.
echo [启动脚本解析结果]
call "%~dp0read-tts-backend.cmd"
echo   TTS_BACKEND=%TTS_BACKEND%
if defined BERT_VITS2_ROOT echo   BERT_VITS2_ROOT=%BERT_VITS2_ROOT%

echo.
echo [TTS 服务 /health]
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 3; Write-Host ('  backend=' + $r.backend); Write-Host ('  configured_engine=' + $r.configured_engine); Write-Host ('  ready=' + $r.ready) } catch { Write-Host '  未连接（请先运行 启动.bat）' }"

echo.
echo 说明:
echo   - 界面「运行中」以 /health 的 backend 为准
echo   - Bert-VITS2 使用项目根 .venv，无需单独再建虚拟环境
echo   - 修改 config.yaml 后需关闭 TTS 窗口并重新运行「启动.bat」
echo.
pause
exit /b 0
