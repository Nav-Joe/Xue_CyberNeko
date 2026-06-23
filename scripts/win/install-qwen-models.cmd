@echo off
rem 下载桌宠所需的 Qwen3 模型：VoiceDesign 1.7B + Base 1.7B
rem 调用前当前目录必须是项目根

setlocal EnableExtensions

call "%~dp0check-qwen-models.cmd"
if not errorlevel 1 (
  echo [跳过] Qwen3 模型权重已齐全 ^(VoiceDesign + Base 1.7B^)。
  exit /b 0
)

echo.
echo [提示] 下载 VoiceDesign 1.7B — 用于提示词生成参考音
echo.

call "%~dp0check-disk-space.cmd" 6
if errorlevel 1 exit /b 1

call "%~dp0..\qwen3-tts\download-model.cmd" VoiceDesign 1.7B
if errorlevel 1 exit /b 1

echo.
echo [提示] 下载 Base 1.7B — 用于克隆音色与语料预热
echo.

call "%~dp0check-disk-space.cmd" 6
if errorlevel 1 exit /b 1

call "%~dp0..\qwen3-tts\download-model.cmd" Base 1.7B
if errorlevel 1 exit /b 1

call "%~dp0check-qwen-models.cmd"
if errorlevel 1 (
  echo [错误] 模型下载后校验失败，请检查 Qwen3_TTS\models\ 目录。
  exit /b 1
)

echo [完成] Qwen3 语音模型已就绪。
exit /b 0
