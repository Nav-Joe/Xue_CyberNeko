@echo off

setlocal EnableExtensions

chcp 65001 >nul

title 雪澜赛博猫娘 - 运行



rem 双击运行时先切到 bat 所在目录（项目根）

cd /d "%~dp0"



call "%~dp0scripts\launch-all.cmd"

call "%~dp0scripts\win\exit-if-error.cmd" "启动失败"

exit /b %ERRORLEVEL%

