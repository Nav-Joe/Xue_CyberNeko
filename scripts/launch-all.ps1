# Optional PowerShell launcher (same as launch-all.cmd)
# Prefer double-clicking 启动.bat

$ErrorActionPreference = 'Continue'
$ScriptDir = $PSScriptRoot
Set-Location (Split-Path $ScriptDir -Parent)

& cmd.exe /c "`"$ScriptDir\launch-all.cmd`""
exit $LASTEXITCODE
