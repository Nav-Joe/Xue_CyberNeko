$ErrorActionPreference = 'Stop'

$Root = (Get-Location).Path
$Run = Join-Path $PSScriptRoot 'run-tts-window.cmd'

$Run = Join-Path $PSScriptRoot 'run-tts-window.cmd'
$arg = '/k call "' + $Run + '"'
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList $arg -PassThru

$Runtime = Join-Path $Root '.runtime'
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
Set-Content -Path (Join-Path $Runtime 'tts-root.pid') -Value $p.Id -Encoding Ascii
