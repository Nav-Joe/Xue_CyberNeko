"""POST/GET /voice-forge/* 业务逻辑（P2c）；session 经 AppRuntime，创建线程仍委托 legacy。"""

from __future__ import annotations

import threading
from typing import Any

from app_config.voice_config import VoiceForgeRejectRequest
from engine_factory import QWEN_CONFIG_PATH
from engines.registry import engine_supports_voice_forge
from qwen_clone_setup import generate_reference_clip, load_reference
from services.runtime_state import AppRuntime
from touch_mode_config import read_touch_mode, write_touch_mode
from voice_forge_config import load_merged_qwen_settings
from voice_forge_paths import (
    read_voice_forge_config,
    resolve_active_sample_dir,
    write_voice_forge_config_patch,
)
from voice_forge_session import (
    PHASE_AWAITING_REVIEW,
    PHASE_GENERATING,
    PHASE_PREWARMING,
    finish_session_success,
    is_awaiting_review,
    should_run_create_voice_flow,
    should_show_review_ui,
)


def resume_pending_session(runtime: AppRuntime) -> dict[str, Any]:
    session = runtime.read_voice_forge_session()
    if not should_run_create_voice_flow(session):
        return {"ok": False, "detail": "没有待处理的创建会话，或参考音已生成"}

    runtime.refresh_touch_mode_from_disk()
    runtime.touch_mode = read_touch_mode()
    if not engine_supports_voice_forge(runtime.backend_name) or runtime.touch_mode != "custom_corpus":
        return {
            "ok": False,
            "detail": f"当前模式不支持创建声线（engine={runtime.backend_name}, touch_mode={runtime.touch_mode}）",
        }

    started = runtime.schedule_create_voice_reference_generation()
    return {"ok": True, "phase": PHASE_GENERATING, "already_running": not started}


def handle_upload_ready(runtime: AppRuntime) -> dict[str, Any]:
    runtime.refresh_touch_mode_from_disk(reconcile=True)
    session = runtime.read_voice_forge_session()
    if not session or session.get("source") != "upload":
        return {"ok": False, "detail": "没有待试听的上传会话"}

    if session.get("phase") != PHASE_AWAITING_REVIEW:
        runtime.update_voice_forge_session(phase=PHASE_AWAITING_REVIEW)

    try:
        runtime.require_clone_reference_files()
    except RuntimeError as error:
        return {"ok": False, "detail": str(error)}

    runtime.voice_forge_review_pending = True
    print("[TTS/VoiceForge] 用户上传参考音已就绪，等待试听确认", flush=True)
    return {"ok": True, "phase": PHASE_AWAITING_REVIEW}


def get_voice_forge_status(runtime: AppRuntime) -> dict[str, Any]:
    session = runtime.read_voice_forge_session()
    sample_dir = resolve_active_sample_dir()
    ref_ready = False
    if sample_dir is not None:
        try:
            load_reference(sample_dir)
            ref_ready = True
        except OSError:
            ref_ready = False
    return {
        "review_pending": runtime.voice_forge_review_pending and should_show_review_ui(session),
        "phase": session.get("phase") if session else None,
        "flow": session.get("flow") if session else None,
        "source": session.get("source") if session else None,
        "displayName": session.get("displayName") if session else None,
        "folderId": session.get("folderId") if session else None,
        "reference_ready": ref_ready,
        "ready": runtime.ready,
    }


def preview_audio(runtime: AppRuntime) -> bytes:
    if not runtime.voice_forge_review_pending:
        raise LookupError("当前无需试听")
    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        raise LookupError("未找到克隆样本")
    try:
        ref_wav, _ = load_reference(sample_dir)
    except OSError as error:
        raise LookupError("参考音频不存在") from error
    return ref_wav.read_bytes()


def approve_voice(runtime: AppRuntime) -> dict[str, Any]:
    session = runtime.read_voice_forge_session()
    if not runtime.voice_forge_review_pending or not is_awaiting_review(session):
        raise ValueError("当前不在试听确认阶段")

    runtime.refresh_touch_mode_from_disk(reconcile=True)
    if runtime.touch_mode != "custom_corpus":
        raise ValueError("当前不是自定义语料模式，无法开始语料预热")

    runtime.update_voice_forge_session(phase=PHASE_PREWARMING)
    runtime.voice_forge_review_pending = False
    print("[TTS/VoiceForge] 用户满意，开始预热语料库...", flush=True)

    try:
        runtime.engine = runtime.load_clone_engine()
    except Exception as error:  # noqa: BLE001
        runtime.voice_forge_review_pending = True
        runtime.update_voice_forge_session(phase=PHASE_AWAITING_REVIEW)
        raise RuntimeError(str(error)) from error

    config = read_voice_forge_config()
    active = config.get("activeSample")
    if isinstance(active, dict):
        write_voice_forge_config_patch({"activeSample": {**active, "pending": False}})

    def _prewarm_runner() -> None:
        try:
            runtime.prewarm_corpus_cache()
            finish_session_success()
            runtime.ready = True
            print("[TTS/VoiceForge] 语料预热完成，音色工坊已启用", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS/VoiceForge] 语料预热失败: {error}", flush=True)
            runtime.update_voice_forge_session(phase=PHASE_AWAITING_REVIEW)
            runtime.voice_forge_review_pending = True

    threading.Thread(target=_prewarm_runner, name="voice-forge-prewarm", daemon=True).start()
    return {"ok": True, "phase": PHASE_PREWARMING}


def reject_voice(runtime: AppRuntime, request: VoiceForgeRejectRequest) -> dict[str, Any]:
    session = runtime.read_voice_forge_session()
    if not runtime.voice_forge_review_pending or not is_awaiting_review(session):
        raise ValueError("当前不在试听确认阶段")

    if request.action == "regenerate":
        if session.get("source") == "upload":
            raise ValueError("上传参考音不支持 VoiceDesign 重新生成，请返回音色工坊重新上传")
        runtime.update_voice_forge_session(phase=PHASE_GENERATING)
        settings = load_merged_qwen_settings(QWEN_CONFIG_PATH)
        sample_dir = resolve_active_sample_dir()
        if sample_dir is None:
            raise RuntimeError("未找到克隆样本目录")
        generate_reference_clip(
            settings,
            sample_dir,
            display_name=session.get("displayName"),
            folder_id=session.get("folderId"),
        )
        runtime.update_voice_forge_session(phase=PHASE_AWAITING_REVIEW)
        runtime.voice_forge_review_pending = True
        runtime.ready = True
        return {"ok": True, "phase": PHASE_AWAITING_REVIEW}

    runtime.refresh_touch_mode_from_disk(reconcile=True)
    write_touch_mode("curated")
    runtime.touch_mode = "curated"
    runtime.engine = None
    runtime.cache_manager = None
    runtime.clear_voice_forge_session()
    runtime.voice_forge_review_pending = False
    runtime.ready = True
    print("[TTS/VoiceForge] 用户跳过，已恢复精选音频模式", flush=True)
    # TODO(P3): 改用 VoiceForgeSessionPhase / PHASE_CANCELLED 常量
    return {"ok": True, "phase": "cancelled", "touch_mode": "curated"}
