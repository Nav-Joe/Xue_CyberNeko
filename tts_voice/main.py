"""
TTS FastAPI 应用工厂（P4：自建 app，不再依赖 tts_server_legacy）。
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent
if str(_BASE_DIR) not in sys.path:
    sys.path.insert(0, str(_BASE_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import cache_tts, system, voice_forge
from services.engine_lifecycle import load_model, shutdown
from services.runtime_state import get_runtime, init_runtime

APP_TITLE = "Xue Cyber Neko TTS"
APP_VERSION = "0.4.0b"


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    runtime = get_runtime()
    load_model(runtime)
    yield
    shutdown(runtime)


def create_app() -> FastAPI:
    init_runtime()

    app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(system.router)
    app.include_router(voice_forge.router)
    app.include_router(cache_tts.router)

    return app


app = create_app()
