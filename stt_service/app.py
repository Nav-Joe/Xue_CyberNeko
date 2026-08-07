"""
stt_service FastAPI 应用：GET /health + POST /v1/recognize。
边界见 CONTRACT.md；不做聊天 / 记忆 / TTS。
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from stt_service.audio_io import BadAudioError, TooLongError, load_wav_bytes
from stt_service.sensevoice import SenseVoiceEngine

SAMPLE_RATE = 16000

# 由 __main__ 在绑定后写入，供 /health 展示
bound_port: Optional[int] = None
engine = SenseVoiceEngine(
    num_threads=max(1, int(os.environ.get("XUE_STT_NUM_THREADS", "2") or "2"))
)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        # 启动时加载模型，避免首个 /v1/recognize 冷启动过久
        engine.load()
        yield

    app = FastAPI(title="Xue CyberNeko STT Service", version="0.1.0", lifespan=lifespan)
    # 渲染进程直连 127.0.0.1：开发态是 Vite 源，打包态常为 file://（Origin: null）。
    # 若无 CORS，Chromium 会直接失败，前端易误报成「语音服务未启动」。
    # 本服务只绑回环，故允许任意 Origin。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        payload: dict[str, Any] = {
            "ok": True,
            "service": "stt",
            "engine": "sherpa-onnx-sensevoice",
            "modelReady": engine.model_ready,
            "sampleRate": SAMPLE_RATE,
        }
        if bound_port is not None:
            payload["port"] = bound_port
        if engine.model_dir is not None:
            payload["modelDir"] = str(engine.model_dir)
        if engine.load_error and not engine.model_ready:
            payload["loadError"] = engine.load_error
        return payload

    @app.post("/v1/recognize")
    async def recognize(
        file: UploadFile = File(...),
        language: str = Form("auto"),
    ) -> JSONResponse:
        if not engine.model_ready:
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "error": "model_not_ready",
                    "message": engine.load_error or "SenseVoice model is not loaded",
                },
            )

        raw = await file.read()
        try:
            wav = load_wav_bytes(raw)
        except BadAudioError as exc:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "bad_audio", "message": str(exc)},
            )
        except TooLongError as exc:
            return JSONResponse(
                status_code=413,
                content={"ok": False, "error": "too_long", "message": str(exc)},
            )

        lang = (language or "auto").strip() or "auto"
        try:
            result = engine.decode(wav.samples, wav.sample_rate, language=lang)
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "error": "recognize_failed",
                    "message": str(exc),
                },
            )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "text": result.text,
                "durationMs": wav.duration_ms,
                "decodeMs": result.decode_ms,
                "language": result.language,
            },
        )

    return app


app = create_app()
