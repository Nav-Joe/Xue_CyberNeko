@echo off
setlocal EnableExtensions

cd /d "%~dp0..\.."

set "PID_FILE=.runtime\electron-root.pid"
if not exist "%PID_FILE%" (
  echo [错误] 找不到 Electron 进程记录：%PID_FILE%
  exit /b 1
)

set /p ELEC_PID=<"%PID_FILE%"
if "%ELEC_PID%"=="" (
  echo [错误] Electron PID 为空。
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procId=%ELEC_PID%; try { Wait-Process -Id $procId -ErrorAction Stop; exit 0 } catch { if ($_.FullyQualifiedErrorId -match 'ProcessNotFound') { exit 0 }; exit 1 }"
set "EXIT_CODE=%ERRORLEVEL%"
del /q "%PID_FILE%" >nul 2>&1
exit /b %EXIT_CODE%
