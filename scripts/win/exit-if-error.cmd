@echo off
rem After calling a child script, pause on failure.
rem Example: call something.cmd & call "%~dp0exit-if-error.cmd" "description"

set "MSG=%~1"
set "CODE=%~2"
if "%CODE%"=="" set "CODE=%ERRORLEVEL%"
if "%CODE%"=="" set "CODE=1"

if not "%CODE%"=="0" (
  call "%~dp0pause-on-error.cmd" "%MSG%" %CODE%
  exit /b %CODE%
)

exit /b 0
