"""音色工坊创建流程会话（仅 create_voice 重启时触发试听确认）。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend_config import RUNTIME_DIR
from voice_forge_paths import resolve_active_sample_dir, sample_paths

SESSION_FILE = RUNTIME_DIR / "voice-forge-session.json"

FLOW_CREATE_VOICE = "create_voice"
PHASE_PENDING_RESTART = "pending_restart"
PHASE_GENERATING = "generating"
PHASE_AWAITING_REVIEW = "awaiting_review"
PHASE_PREWARMING = "prewarming"
PHASE_COMPLETED = "completed"
PHASE_CANCELLED = "cancelled"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_session() -> dict[str, Any] | None:
    if not SESSION_FILE.is_file():
        return None
    try:
        data = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def write_session(data: dict[str, Any]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clear_session() -> None:
    if SESSION_FILE.is_file():
        SESSION_FILE.unlink()


def start_create_voice_session(*, folder_id: str, display_name: str) -> dict[str, Any]:
    session = {
        "version": 1,
        "flow": FLOW_CREATE_VOICE,
        "phase": PHASE_PENDING_RESTART,
        "folderId": folder_id,
        "displayName": display_name,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    write_session(session)
    return session


def update_session(**fields: Any) -> dict[str, Any] | None:
    session = read_session() or {}
    session.update(fields)
    session["updatedAt"] = _now_iso()
    write_session(session)
    return session


def session_reference_ready() -> bool:
    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        return False
    ref_wav, _, _ = sample_paths(sample_dir)
    return ref_wav.is_file()


def should_run_create_voice_flow(session: dict[str, Any] | None) -> bool:
    if not session:
        return False
    if session.get("flow") != FLOW_CREATE_VOICE:
        return False
    phase = session.get("phase")
    if phase == PHASE_PENDING_RESTART:
        return True
    if phase == PHASE_GENERATING:
        # 上次生成被中断（如误触进程重启）时可续跑
        return not session_reference_ready()
    return False


def is_awaiting_review(session: dict[str, Any] | None) -> bool:
    return bool(session and session.get("phase") == PHASE_AWAITING_REVIEW)


def should_show_review_ui(session: dict[str, Any] | None) -> bool:
    return is_awaiting_review(session)


def finish_session_success() -> None:
    session = read_session()
    if not session:
        return
    update_session(flow=None, phase=PHASE_COMPLETED)


def finish_session_cancelled() -> None:
    session = read_session()
    if not session:
        return
    update_session(flow=None, phase=PHASE_CANCELLED)
