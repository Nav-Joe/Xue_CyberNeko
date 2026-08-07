@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0win\ensure-system-path.cmd"
chcp 65001 >nul 2>&1
title 雪澜赛博猫娘 - 首次安装

cd /d "%~dp0.."

set "XUE_AUTO_INSTALL_RUNTIME=1"

call "%~dp0win\check-setup-complete.cmd"
if not errorlevel 1 goto :already_done

echo.
echo ========================================
echo   雪澜赛博猫娘 - 首次安装
echo   将依次安装：
echo     - Node.js / Python ^(缺失时自动安装，见 scripts\win\runtime-versions.cmd^)
echo     - Node.js 依赖 ^(npm install^)
echo     - Python 虚拟环境 ^(.venv^)
echo     - Qwen3-TTS 引擎依赖与 PyTorch
echo     - STT 侧车依赖 ^(sherpa-onnx 等，stt_service\requirements.txt^)
echo     - SenseVoice STT 模型 ^(约 230MB，.runtime\stt-models\^)
echo     - Qwen3 模型：VoiceDesign 1.7B + Base 1.7B
echo.
echo   Live2D 模型将在安装完成后引导下载（桃濑日和）
echo ========================================
echo.

echo [步骤 1/5] 检测运行环境...
echo.

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\check-python.cmd"
if errorlevel 1 exit /b 1

echo.
call "%~dp0win\check-disk-space.cmd" 15
if errorlevel 1 exit /b 1

echo.
echo [步骤 2/5] 安装 Node 依赖...
echo.

call "%~dp0win\check-disk-space.cmd" 3
if errorlevel 1 exit /b 1

call npm install
if errorlevel 1 exit /b 1

echo.
echo [步骤 3/5] 创建 Python 虚拟环境 ^(.venv^)...
echo.

call "%~dp0win\check-disk-space.cmd" 6
if errorlevel 1 exit /b 1

call "%~dp0win\ensure-venv.cmd"
if errorlevel 1 exit /b 1

echo.
echo [步骤 4/5] 安装 TTS / Qwen3-TTS 依赖与 PyTorch...
echo.

call "%~dp0win\check-disk-space.cmd" 8
if errorlevel 1 exit /b 1

call "%~dp0win\install-tts-deps.cmd"
if errorlevel 1 exit /b 1

echo.
echo [步骤 5/5] 安装 STT 侧车依赖...
echo.

call "%~dp0win\check-disk-space.cmd" 1
if errorlevel 1 exit /b 1

call "%~dp0win\install-stt-deps.cmd"
if errorlevel 1 exit /b 1

echo.
echo [附加] 下载 SenseVoice STT 模型权重...
echo.

call "%~dp0win\install-stt-models.cmd"
if errorlevel 1 exit /b 1

echo.
echo [附加] 下载 Qwen3 语音模型权重（ModelScope，体积较大）...
echo.

call "%~dp0win\check-disk-space.cmd" 10
if errorlevel 1 exit /b 1

call "%~dp0win\install-qwen-models.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\check-setup-complete.cmd"
if errorlevel 1 (
  echo [错误] 安装流程结束但校验未通过，请查看上方报错后重试。
  exit /b 1
)

echo.
call "%~dp0win\prompt-live2d-model.cmd"
if errorlevel 1 (
  echo [WARN] Live2D model not ready yet. Close this window, place the model, then relaunch.
)

echo.
echo ========================================
echo   [OK] First-time setup is complete.
echo   Close this window, then run the launcher bat in the repo root.
echo ========================================
echo.
pause
exit /b 0

:already_done
echo.
echo ========================================
echo   First-time setup already complete.
echo.
echo   No need to install again. You can close this window.
echo   Next: run the launcher bat in the repo root.
echo ========================================
echo.
echo   Re-download Qwen: scripts/win/install-qwen-models.cmd
echo   Re-download STT model: scripts/win/install-stt-models.cmd
echo.
pause
exit /b 0
