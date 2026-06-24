@echo off
rem 保证 System32 等系统目录在当前 cmd 会话 PATH 中（避免 refresh/reg 误伤后 chcp/where 不可用）
if defined SystemRoot (
  set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\Wbem;%PATH%"
) else (
  set "PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;%PATH%"
)
exit /b 0
