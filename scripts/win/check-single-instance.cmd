@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0..\.."

call "%~dp0ensure-system-path.cmd"
call "%~dp0refresh-shell-path.cmd"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [错误] 未找到 Node.js，请先运行「首次安装.bat」或安装 Node 20+
  exit /b 1
)

node "%~dp0..\app-instance-lock.js" check
set "CHECK_CODE=%ERRORLEVEL%"
if "%CHECK_CODE%"=="2" goto :already_running
if not "%CHECK_CODE%"=="0" (
  echo.
  echo [错误] 单实例检查失败，退出码: %CHECK_CODE%
  exit /b 1
)
exit /b 0

:already_running
echo.
echo ========================================
echo   [提示] 雪澜赛博猫娘已在运行中
echo.
echo   请勿重复启动，否则会出现多只桌宠。
echo   若你在终端运行了 npm run dev，请先关闭。
echo   若刚异常退出，可删除: .runtime\app-instance.lock
echo ========================================
exit /b 1
