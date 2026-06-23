@echo off

setlocal EnableExtensions

chcp 65001 >nul



cd /d "%~dp0..\.."

node scripts\live2d-model.js --check

exit /b %ERRORLEVEL%

