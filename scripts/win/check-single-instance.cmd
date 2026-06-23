@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0..\.."

node "%~dp0..\app-instance-lock.js" check
if not errorlevel 2 exit /b 0

echo.
echo ========================================
echo   [提示] 雪澜赛博猫娘已在运行中
echo.
echo   请勿重复启动，否则会出现多只桌宠。
echo   若误报，请删除项目根目录下的锁文件
echo   .runtime\app-instance.lock
echo ========================================
echo.
echo 按任意键关闭本窗口...
pause >nul
exit /b 1
