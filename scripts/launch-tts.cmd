@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0.."
call "%~dp0win\run-tts-window.cmd"
call "%~dp0win\exit-if-error.cmd" "TTS 启动失败"
exit /b %ERRORLEVEL%
