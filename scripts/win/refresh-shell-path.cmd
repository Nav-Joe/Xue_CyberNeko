@echo off
rem 在现有 PATH 前追加常见 Node/Python 安装目录（不覆盖、不读注册表，避免 PATH 被解析错误截断）
call "%~dp0ensure-system-path.cmd"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LocalAppData%\Programs\Python\Python310;%LocalAppData%\Programs\Python\Python310\Scripts;%ProgramFiles%\Python310;%ProgramFiles%\Python310\Scripts;%PATH%"
exit /b 0
