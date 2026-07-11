"""P2c：/voice-forge/*。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from api.dependencies import runtime_dep
from app_config.voice_config import VoiceForgeRejectRequest
from services.runtime_state import AppRuntime
from services import voice_forge_service as vf

router = APIRouter(tags=["voice-forge"])


@router.post("/voice-forge/resume-pending")
def voice_forge_resume_pending(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    return vf.resume_pending_session(runtime)


@router.post("/voice-forge/upload-ready")
def voice_forge_upload_ready(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    return vf.handle_upload_ready(runtime)


@router.get("/voice-forge/status")
def voice_forge_status(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    return vf.get_voice_forge_status(runtime)


@router.get("/voice-forge/preview-audio")
def voice_forge_preview_audio(runtime: AppRuntime = Depends(runtime_dep)) -> Response:
    try:
        return Response(content=vf.preview_audio(runtime), media_type="audio/wav")
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/voice-forge/approve")
def voice_forge_approve(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    try:
        return vf.approve_voice(runtime)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/voice-forge/reject")
def voice_forge_reject(
    request: VoiceForgeRejectRequest,
    runtime: AppRuntime = Depends(runtime_dep),
) -> dict:
    try:
        return vf.reject_voice(runtime, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
