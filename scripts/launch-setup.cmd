@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 雪澜赛博猫娘 - 首次安装

cd /d "%~dp0.."

call "%~dp0win\check-node.cmd"
if errorlevel 1 exit /b 1

echo.
echo ========================================
echo   雪澜赛博猫娘 - 首次安装
echo   1. npm install
echo   2. 下载 Live2D 示例模型
echo ========================================
echo.

call npm install
if errorlevel 1 (
  call "%~dp0win\pause-on-error.cmd" "npm install 失败"
  exit /b 1
)

call npm run setup:model
if errorlevel 1 (
  call "%~dp0win\pause-on-error.cmd" "模型下载失败"
  exit /b 1
)

echo.
echo [完成] 安装完毕。请双击「启动开发.bat」开始测试。
echo.
pause
exit /b 0
