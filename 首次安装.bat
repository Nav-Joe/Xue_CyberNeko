@echo off
setlocal EnableExtensions

call "%~dp0scripts\win\ensure-system-path.cmd"
call "%~dp0scripts\launch-setup.cmd"

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  call "%~dp0scripts\win\exit-if-error.cmd" "首次安装失败" %EXIT_CODE%
  exit /b %EXIT_CODE%
)

exit /b 0
