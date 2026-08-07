@echo off
setlocal EnableExtensions

cd /d "%~dp0"

call "%~dp0scripts\win\ensure-system-path.cmd"
call "%~dp0scripts\launch-setup.cmd"

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  call "%~dp0scripts\win\exit-if-error.cmd" "first-time setup failed" %EXIT_CODE%
  exit /b %EXIT_CODE%
)

exit /b 0