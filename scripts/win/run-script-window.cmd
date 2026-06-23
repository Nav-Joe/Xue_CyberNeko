@echo off
rem 供独立 CMD 弹窗调用：执行目标 bat，失败时 pause（配合 cmd /k 使用）
setlocal EnableExtensions
chcp 65001 >nul

set "SCRIPT=%~1"
if "%SCRIPT%"=="" (
  call "%~dp0pause-on-error.cmd" "未指定要运行的脚本"
  exit /b 1
)

call "%SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  call "%~dp0pause-on-error.cmd" "脚本执行失败" %EXIT_CODE%
)

exit /b %EXIT_CODE%
