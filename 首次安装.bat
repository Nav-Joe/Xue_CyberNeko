@echo off

call "%~dp0scripts\launch-setup.cmd"

call "%~dp0scripts\win\exit-if-error.cmd" "首次安装失败"

exit /b %ERRORLEVEL%

