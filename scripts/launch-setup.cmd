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
echo   必要项：
echo     - Node.js / Python ^(缺失时自动安装^)
echo     - Node.js 依赖与 Python 虚拟环境
echo     - Live2D 模型（下载前需同意官方无偿素材许可，或已自备模型）
echo.
echo   语音合成、听写、本地 Qwen 权重、本地聊天模型
echo   不再在这里安装，装好后到桌宠设置「环境」里按需安装。
echo ========================================
echo.

echo [步骤 1/4] 检测运行环境...
echo.

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\check-python.cmd"
if errorlevel 1 exit /b 1

echo.
call "%~dp0win\check-disk-space.cmd" 4
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
echo [步骤 4/4] 安装 Live2D 模型（必装，下载前确认许可）...
echo.

call "%~dp0win\prompt-live2d-model.cmd"
if errorlevel 1 exit /b 1

call "%~dp0win\check-setup-complete.cmd"
if errorlevel 1 (
  echo [错误] 安装流程结束但校验未通过，请查看上方报错后重试。
  exit /b 1
)

echo.
echo.
echo ========================================
echo   [OK] 必要环境已装好（含 Live2D 模型）。
echo   关掉本窗口后，用仓库根目录的启动脚本运行。
echo   语音合成、听写、本地模型请到桌宠设置「环境」里安装。
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
echo   非必要组件请到桌宠设置「环境」里安装或卸载。
echo.
pause
exit /b 0
