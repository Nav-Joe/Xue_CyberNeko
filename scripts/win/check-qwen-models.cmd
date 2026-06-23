@echo off
rem 返回 0 = VoiceDesign + Base 1.7B 权重已就绪；1 = 缺失
rem 调用前当前目录必须是项目根

set "VD=Qwen3_TTS\models\Qwen3-TTS-12Hz-1.7B-VoiceDesign\config.json"
set "BASE=Qwen3_TTS\models\Qwen3-TTS-12Hz-1.7B-Base\config.json"

if not exist "%VD%" exit /b 1
if not exist "%BASE%" exit /b 1

exit /b 0
