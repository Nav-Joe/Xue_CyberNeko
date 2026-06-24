@echo off

setlocal EnableExtensions

call "%~dp0scripts\win\ensure-system-path.cmd"

chcp 65001 >nul 2>&1

title 雪澜赛博猫娘 - 运行



rem 双击运行时先切到 bat 所在目录（项目根）

cd /d "%~dp0"



call "%~dp0scripts\launch-all.cmd"

call "%~dp0scripts\win\exit-if-error.cmd" "启动失败"

exit /b %ERRORLEVEL%
