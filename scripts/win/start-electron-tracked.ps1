$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Runtime = Join-Path $Root '.runtime'
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

# 单独 cmd 跑 npm run dev，父脚本可先起 TTS，再 Wait-Process
$arg = '/c cd /d "' + $Root + '" && npm run dev'
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList $arg -PassThru -WorkingDirectory $Root

Set-Content -Path (Join-Path $Runtime 'electron-root.pid') -Value $p.Id -Encoding Ascii
Write-Output $p.Id
