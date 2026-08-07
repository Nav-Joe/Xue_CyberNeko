@echo off
rem Return 0 = SenseVoice weights present; 1 = missing
rem Call from repo root. Weights stay under .runtime\stt-models\ (gitignored).

set "STT_MODEL=.runtime\stt-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09"
set "STT_LEGACY=.runtime\stt-models\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"

if exist "%STT_MODEL%\tokens.txt" (
  if exist "%STT_MODEL%\model.int8.onnx" exit /b 0
  if exist "%STT_MODEL%\model.onnx" exit /b 0
)

if exist "%STT_LEGACY%\tokens.txt" (
  if exist "%STT_LEGACY%\model.int8.onnx" exit /b 0
  if exist "%STT_LEGACY%\model.onnx" exit /b 0
)

exit /b 1
