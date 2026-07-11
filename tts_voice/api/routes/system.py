"""GET /health（P2a）；POST /touch-mode/sync（P2b-ii-b）。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import runtime_dep
from app_config.voice_config import TouchModeSyncResponse
from services.health_service import build_health_payload
from services.runtime_state import AppRuntime
from services.sync_service import sync_touch_mode_entry

router = APIRouter(tags=["system"])


@router.get("/health")
def health(runtime: AppRuntime = Depends(runtime_dep)) -> dict:
    return build_health_payload(runtime)


@router.post("/touch-mode/sync", response_model=TouchModeSyncResponse)
def touch_mode_sync(runtime: AppRuntime = Depends(runtime_dep)) -> TouchModeSyncResponse:
    return sync_touch_mode_entry(runtime, None)
