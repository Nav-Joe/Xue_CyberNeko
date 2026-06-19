"""
雪澜赛博猫娘 - Bert-VITS2 TTS 服务

启动:
  set BERT_VITS2_ROOT=D:\\path\\to\\Bert-VITS2
  python tts_voice/tts_server.py

接口:
  POST http://127.0.0.1:8000/tts
  Body: {"text": "你好", "speaker_id": 0}
  Response: audio/wav (22050Hz)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

DEFAULT_BERT_VITS2_ROOT = BASE_DIR.parent / "Bert-VITS2"
CONFIG_PATH = BASE_DIR / "config.json"
MODEL_PATH = BASE_DIR / "G_900.pth"

app = FastAPI(title="Xue Cyber Neko TTS", version="0.1.0")
engine = None


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200)
    speaker_id: int = 0


@app.on_event("startup")
def load_model() -> None:
    global engine

    bert_vits2_root = Path(os.environ.get("BERT_VITS2_ROOT", str(DEFAULT_BERT_VITS2_ROOT)))

    from infer_engine import create_engine

    engine = create_engine(
        config_path=CONFIG_PATH,
        model_path=MODEL_PATH,
        bert_vits2_root=bert_vits2_root,
    )


@app.get("/health")
def health():
    return {"status": "ok", "engine": engine is not None}


@app.post("/tts")
def tts(request: TtsRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="TTS 引擎尚未就绪")

    try:
        wav_bytes = engine.synthesize(request.text, request.speaker_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - 返回可读错误给前端调试
        raise HTTPException(status_code=500, detail=str(error)) from error

    return Response(content=wav_bytes, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
