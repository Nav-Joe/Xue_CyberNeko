@echo off
rem 安装 Node/Python 后刷新当前 cmd 会话的 PATH（无需重开窗口）
set "USER_PATH="
set "SYS_PATH="
for /f "skip=2 tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%B"
for /f "skip=2 tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
if defined USER_PATH if defined SYS_PATH (
  set "PATH=%USER_PATH%;%SYS_PATH%"
) else if defined SYS_PATH (
  set "PATH=%SYS_PATH%"
)

set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LocalAppData%\Programs\Python\Python310;%LocalAppData%\Programs\Python\Python310\Scripts;%ProgramFiles%\Python310;%ProgramFiles%\Python310\Scripts;%PATH%"
exit /b 0
