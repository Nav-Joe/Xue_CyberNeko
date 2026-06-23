@echo off
rem 检测项目所在磁盘剩余空间是否足够
rem 用法: check-disk-space.cmd [至少需要 GB，默认 5]
setlocal EnableExtensions EnableDelayedExpansion

set "MIN_GB=%~1"
if "%MIN_GB%"=="" set "MIN_GB=5"

for %%I in ("%~dp0..\..") do set "ROOT=%%~fI"
set "DRIVE_LETTER=%ROOT:~0,1%"

set "FREE_GB="
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "[math]::Floor((Get-PSDrive -Name '%DRIVE_LETTER%').Free / 1GB)" 2^>nul`) do set "FREE_GB=%%F"

if not defined FREE_GB (
  echo [警告] 无法读取磁盘 %DRIVE_LETTER%: 剩余空间，请自行确保至少有 %MIN_GB% GB 可用。
  exit /b 0
)

echo [检测] 磁盘 %DRIVE_LETTER%: 剩余约 !FREE_GB! GB ^(本步骤至少需要 %MIN_GB% GB^)

if !FREE_GB! LSS %MIN_GB% (
  echo.
  echo [错误] 磁盘空间不足，安装已中止。
  echo        当前约 !FREE_GB! GB，本步骤至少需要 %MIN_GB! GB。
  echo        请清理 %DRIVE_LETTER%: 盘空间后重新运行「首次安装.bat」。
  echo.
  exit /b 1
)

exit /b 0
