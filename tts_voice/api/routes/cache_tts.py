"""P2d：/cache/*、POST /tts。"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from api.dependencies import runtime_dep
from app_config.voice_config import TtsBatchRequest, TtsRequest
from services.cache_service import (
    build_cache_status,
    fetch_cache_audio,
    rebuild_cache,
    synthesize_tts,
    synthesize_tts_batch,
)
from services.runtime_state import AppRuntime

router = APIRouter(tags=["cache", "tts"])


@router.get("/cache/status")
def cache_status(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    return build_cache_status(runtime)


@router.post("/cache/rebuild")
def cache_rebuild(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    try:
        return rebuild_cache(runtime)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/cache/audio")
def cache_audio(
    text: str,
    variant: int | None = None,
    runtime: AppRuntime = Depends(runtime_dep),
) -> Response:
    result = fetch_cache_audio(runtime, text, variant)
    if result.error_status is not None:
        raise HTTPException(status_code=result.error_status, detail=result.error_detail or "")
    return Response(content=result.wav_bytes, media_type="audio/wav")


@router.post("/tts")
def tts(request: TtsRequest, runtime: AppRuntime = Depends(runtime_dep)) -> Response:
    try:
        wav_bytes = synthesize_tts(runtime, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(error)) from error
    return Response(content=wav_bytes, media_type="audio/wav")


@router.post("/tts/batch")
def tts_batch(request: TtsBatchRequest, runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    try:
        audios = synthesize_tts_batch(runtime, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {
        "count": len(audios),
        "audios_base64": [base64.b64encode(chunk).decode("ascii") for chunk in audios],
    }
