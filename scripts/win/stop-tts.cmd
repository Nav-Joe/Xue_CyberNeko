@echo off
setlocal EnableExtensions

rem 项目根目录下调用
cd /d "%~dp0..\.." 2>nul || cd /d "%CD%"

if not exist ".runtime" mkdir ".runtime"

if exist ".runtime\tts-root.pid" (
  for /f "usebackq delims=" %%p in (".runtime\tts-root.pid") do (
    taskkill /PID %%p /T /F >nul 2>&1
  )
  del /f /q ".runtime\tts-root.pid" >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

exit /b 0
