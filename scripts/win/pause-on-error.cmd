@echo off
call "%~dp0ensure-system-path.cmd"
chcp 65001 >nul 2>&1
echo.
echo ========================================
if not "%~1"=="" (
  echo   [错误] %~1
) else (
  echo   [错误] 操作失败
)
if not "%~2"=="" (
  echo   退出码: %~2
) else if not "%ERRORLEVEL%"=="0" (
  echo   退出码: %ERRORLEVEL%
)
echo ========================================
echo.
echo 请把上方完整输出截图或复制以便排查。
echo 按任意键关闭本窗口...
echo.
pause >nul
