"""GET /health 响应构建（P2a）。"""

from __future__ import annotations

from typing import Any

from engines.registry import engine_supports_voice_forge, read_engine_name
from services.runtime_state import AppRuntime
from voice_forge_session import read_session


def build_health_payload(runtime: AppRuntime) -> dict[str, Any]:
    runtime.refresh_touch_mode_from_disk()
    payload: dict[str, Any] = {
        "status": "ok" if runtime.ready else "loading",
        "backend": runtime.backend_name,
        "configured_engine": read_engine_name(),
        "voice_forge_supported": engine_supports_voice_forge(runtime.backend_name),
        "touch_mode": runtime.touch_mode,
        "engine": runtime.engine is not None,
        "ready": runtime.ready,
        "voice_forge_review_pending": runtime.voice_forge_review_pending,
        "sync_running": runtime.touch_mode_sync_running,
        "prewarm_active": runtime.is_prewarm_active(),
        "engine_matches_active": (
            runtime.runtime_matches_active_sample() if runtime.engine is not None else False
        ),
        "sample_folder_id": runtime.active_folder_id(),
    }
    if runtime.cache_manager is not None:
        payload["cache"] = runtime.cache_manager.status()
    session = read_session()
    if session:
        payload["voice_forge"] = {
            "phase": session.get("phase"),
            "flow": session.get("flow"),
            "displayName": session.get("displayName"),
            "folderId": session.get("folderId"),
        }
    return payload
