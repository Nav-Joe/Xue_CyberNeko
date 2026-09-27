@echo off
rem Optional download: local Qwen3 TTS weights (VoiceDesign 1.7B + Base 0.6B).
rem Repo root must be cwd. Skipping must NOT fail first-time setup.

setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

call "%~dp0check-qwen-models.cmd"
if not errorlevel 1 (
  echo [跳过] Qwen3 模型权重已齐全 ^(VoiceDesign 1.7B + Base 0.6B^)。
  exit /b 0
)

:menu
echo.
echo ========================================
echo   可选：下载本地 Qwen3 语音模型
echo.
echo   VoiceDesign 1.7B + Base 0.6B
echo   体积较大（约数 GB，经 ModelScope）
echo.
echo   用途：本地音色工坊（创造/克隆/预热）
echo   仅使用云端音色工坊时可跳过。
echo.
echo   [1] 下载本地 Qwen3 模型
echo   [2] 跳过（稍后可手动下载）
echo ========================================
echo.

choice /C 12 /N /M "请选择 [1] 下载  [2] 跳过: "
if errorlevel 2 goto :skip
if errorlevel 1 goto :download

:download
echo.
echo [Qwen3] 开始下载本地语音模型...
call "%~dp0check-disk-space.cmd" 10
if errorlevel 1 exit /b 1

call "%~dp0install-qwen-models.cmd"
if errorlevel 1 (
  echo [错误] Qwen3 模型下载失败。可稍后运行 scripts\win\install-qwen-models.cmd 重试。
  echo        跳过也可继续使用云端音色工坊。
  exit /b 0
)
exit /b 0

:skip
echo.
echo [提示] 已跳过本地 Qwen3 模型下载。
echo        本地音色工坊将隐藏，直到权重就绪。
echo        需要时请运行：scripts\win\install-qwen-models.cmd
exit /b 0
