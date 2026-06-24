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
echo     - Qwen3 模型：VoiceDesign 1.7B + Base 1.7B
echo.
echo   Live2D 模型将在安装完成后引导下载（桃濑日和）
echo ========================================
echo.

echo [步骤 1/4] 检测运行环境...
echo.

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\check-python.cmd"
if errorlevel 1 exit /b 1

echo.
call "%~dp0win\check-disk-space.cmd" 15
if errorlevel 1 exit /b 1

echo.
echo [步骤 2/4] 安装 Node 依赖...
echo.

call "%~dp0win\check-disk-space.cmd" 3
if errorlevel 1 exit /b 1

call npm install
if errorlevel 1 exit /b 1

echo.
echo [步骤 3/4] 创建 Python 虚拟环境 ^(.venv^)...
echo.

call "%~dp0win\check-disk-space.cmd" 6
if errorlevel 1 exit /b 1

call "%~dp0win\ensure-venv.cmd"
if errorlevel 1 exit /b 1

echo.
echo [步骤 4/4] 安装 TTS / Qwen3-TTS 依赖与 PyTorch...
echo.

call "%~dp0win\check-disk-space.cmd" 8
if errorlevel 1 exit /b 1

call "%~dp0win\install-tts-deps.cmd"
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
  echo [警告] Live2D 模型尚未就绪，可先关闭本窗口，放置模型后再启动。
)

echo.
echo ========================================
echo   [完成] 首次安装已全部就绪。
echo   请关闭本窗口，双击「启动.bat」运行桌宠。
echo ========================================
echo.
pause
exit /b 0

:already_done
echo.
echo ========================================
echo   检测到已完成首次安装（所需环境均已就绪）
echo.
echo   无需重复安装。请关闭本窗口。
echo   双击「启动.bat」即可运行桌宠。
echo ========================================
echo.
echo   Qwen 模型下载见首次安装提示，或 scripts\win\install-qwen-models.cmd
echo.
pause
exit /b 0
