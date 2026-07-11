"""TTS 引擎加载、切换、销毁与启动（P4）。"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

from engine_factory import QWEN_CONFIG_PATH, create_engine
from engines.registry import engine_supports_voice_forge, read_engine_name
from qwen_clone_setup import (
    consume_regenerate_flag,
    generate_reference_clip,
    require_clone_reference_files,
)
from services.runtime_state import AppRuntime
from touch_mode_config import is_corpus_touch_mode, read_touch_mode, resolve_corpus_path, write_touch_mode
from voice_forge_config import load_merged_qwen_settings
from voice_forge_paths import get_active_sample_info, resolve_active_sample_dir
from voice_forge_session import (
    PHASE_AWAITING_REVIEW,
    PHASE_GENERATING,
    PHASE_PENDING_RESTART,
    PHASE_PREWARMING,
    clear_session,
    finish_session_success,
    is_awaiting_review,
    read_session,
    should_run_create_voice_flow,
    update_session,
)
from voice_runtime_repair import reconcile_runtime_voice_config


def bump_touch_mode_sync_generation(runtime: AppRuntime) -> int:
    runtime.touch_mode_sync_generation += 1
    return runtime.touch_mode_sync_generation


def touch_mode_sync_stale(runtime: AppRuntime, generation: int) -> bool:
    return generation != runtime.touch_mode_sync_generation


def active_folder_id(runtime: AppRuntime) -> str | None:
    active = get_active_sample_info()
    if not isinstance(active, dict):
        return None
    folder_id = active.get("folderId")
    return folder_id.strip() if isinstance(folder_id, str) and folder_id.strip() else None


def refresh_touch_mode_from_disk(runtime: AppRuntime, *, reconcile: bool = False) -> str:
    next_mode = reconcile_runtime_voice_config() if reconcile else read_touch_mode()
    if next_mode != runtime.touch_mode:
        print(f"[TTS] 触摸模式同步: {runtime.touch_mode} -> {next_mode}", flush=True)
    runtime.touch_mode = next_mode
    return runtime.touch_mode


def is_alt_engine_corpus_mode(runtime: AppRuntime, mode: str | None = None) -> bool:
    return (mode or runtime.touch_mode) == "alt_engine_corpus"


def uses_private_engine_cache(runtime: AppRuntime) -> bool:
    return not engine_supports_voice_forge(runtime.backend_name)


def _engine_sample_dir(runtime: AppRuntime) -> Path | None:
    if runtime.engine is None:
        return None
    ref = getattr(runtime.engine, "clone_reference_path", None)
    if ref is None:
        return None
    try:
        path = Path(ref).resolve()
    except OSError:
        return None
    if not path.is_file():
        return None
    return path.parent


def runtime_matches_active_sample(runtime: AppRuntime) -> bool:
    if uses_private_engine_cache(runtime):
        return runtime.engine is not None
    active_dir = resolve_active_sample_dir()
    engine_dir = _engine_sample_dir(runtime)
    if active_dir is None or engine_dir is None:
        return False
    return active_dir.resolve() == engine_dir.resolve()


def invalidate_voice_runtime(runtime: AppRuntime, reason: str = "") -> None:
    if reason:
        print(f"[TTS] {reason}，卸载旧克隆引擎", flush=True)
    runtime.engine = None
    runtime.cache_manager = None
    runtime.cached_sample_id = None


def load_clone_engine(runtime: AppRuntime, *, force_regenerate: bool = False):
    if not force_regenerate:
        force_regenerate = consume_regenerate_flag()
    os.environ["QWEN_USE_CLONE"] = "1"
    os.environ["QWEN_ALLOW_REFERENCE_GENERATE"] = "1" if force_regenerate else "0"
    if force_regenerate:
        os.environ["QWEN_FORCE_REGENERATE_VOICE"] = "1"
        print("[TTS/Qwen Clone] 将重新生成克隆参考音", flush=True)
    else:
        os.environ.pop("QWEN_FORCE_REGENERATE_VOICE", None)
    _, clone_engine = create_engine()
    clone_engine.warmup()
    return clone_engine


def load_clone_engine_for_sample_dir(sample_dir: Path):
    from qwen_engine import QwenCloneEngine

    print(
        f"[TTS/Qwen Clone] 为离线语料预热加载克隆引擎 · sample={sample_dir.name}",
        flush=True,
    )
    clone_engine = QwenCloneEngine(
        QWEN_CONFIG_PATH,
        allow_reference_generate=False,
        reference_sample_dir=sample_dir,
    )
    clone_engine.warmup()
    return clone_engine


def mount_default_engine(runtime: AppRuntime) -> None:
    _, eng = create_engine()
    eng.warmup()
    runtime.engine = eng


def _run_create_voice_reference_generation(runtime: AppRuntime) -> None:
    session = read_session()
    if not session:
        raise RuntimeError("缺少音色工坊会话")

    update_session(phase=PHASE_GENERATING)
    settings = load_merged_qwen_settings(QWEN_CONFIG_PATH)
    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        raise RuntimeError("未找到待生成的克隆样本目录")

    generate_reference_clip(
        settings,
        sample_dir,
        display_name=session.get("displayName"),
        folder_id=session.get("folderId"),
    )
    update_session(phase=PHASE_AWAITING_REVIEW)
    runtime.voice_forge_review_pending = True


def schedule_create_voice_reference_generation(runtime: AppRuntime) -> bool:
    session = read_session()
    if not should_run_create_voice_flow(session):
        return False
    if not runtime.create_voice_lock.acquire(blocking=False):
        print("[TTS/VoiceForge] 创建流程已在运行，跳过重复请求", flush=True)
        return True

    def _runner() -> None:
        try:
            _run_create_voice_reference_generation(runtime)
            runtime.ready = True
            print("[TTS/VoiceForge] 克隆参考音已生成，等待试听", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS/VoiceForge] 生成克隆参考音失败: {error}", flush=True)
            update_session(phase=PHASE_PENDING_RESTART)
        finally:
            runtime.create_voice_lock.release()

    threading.Thread(target=_runner, name="voice-forge-create", daemon=True).start()
    return True


def load_model(runtime: AppRuntime) -> None:
    from services.cache_lifecycle import prewarm_corpus_cache

    runtime.backend_name = read_engine_name()
    runtime.touch_mode = reconcile_runtime_voice_config()
    corpus_path = resolve_corpus_path()
    session = read_session()

    print(f"[TTS] 当前后端: {runtime.backend_name}", flush=True)
    print(f"[TTS] 触摸模式: {runtime.touch_mode}", flush=True)

    use_qwen_clone = engine_supports_voice_forge(runtime.backend_name) and runtime.touch_mode == "custom_corpus"
    force_regenerate_voice = consume_regenerate_flag()

    if use_qwen_clone and should_run_create_voice_flow(session):
        if schedule_create_voice_reference_generation(runtime):
            runtime.ready = True
            print("[TTS] 正在后台生成克隆参考音（音色工坊）", flush=True)
        else:
            runtime.ready = True
            print("[TTS] 克隆参考音已存在或无需生成", flush=True)
        return

    if use_qwen_clone and is_awaiting_review(session):
        runtime.voice_forge_review_pending = True
        runtime.ready = True
        print("[TTS] 等待用户试听确认（音色工坊）", flush=True)
        return

    if use_qwen_clone:
        os.environ["QWEN_USE_CLONE"] = "1"
        os.environ["QWEN_ALLOW_REFERENCE_GENERATE"] = "0"
        if force_regenerate_voice:
            os.environ["QWEN_FORCE_REGENERATE_VOICE"] = "1"
            os.environ["QWEN_ALLOW_REFERENCE_GENERATE"] = "1"
            print("[TTS/Qwen Clone] 将重新生成克隆参考音并重建语料缓存", flush=True)
        else:
            require_clone_reference_files()

    print("[TTS] 正在加载语音模型...", flush=True)
    _, eng = create_engine()
    eng.warmup()
    runtime.engine = eng

    if is_corpus_touch_mode(runtime.touch_mode) and corpus_path.is_file():
        if is_alt_engine_corpus_mode(runtime) and engine_supports_voice_forge(runtime.backend_name):
            print("[TTS Cache] Qwen 引擎不应使用 alt_engine_corpus，已回退精选音频模式", flush=True)
            write_touch_mode("curated")
            runtime.touch_mode = "curated"
            runtime.engine = None
            runtime.cache_manager = None
        else:
            try:
                prewarm_corpus_cache(runtime)
            except Exception as error:  # noqa: BLE001
                print(f"[TTS Cache] 语料预热失败，已回退精选音频模式: {error}", flush=True)
                write_touch_mode("curated")
                runtime.touch_mode = "curated"
                runtime.engine = None
                runtime.cache_manager = None
                clear_session()
            else:
                session_after = read_session()
                if (
                    session_after
                    and session_after.get("phase") == PHASE_PREWARMING
                    and runtime.cache_manager is not None
                    and runtime.cache_manager.is_cache_valid()
                ):
                    finish_session_success()
                    print("[TTS/VoiceForge] 检测到上次预热已完成，已清理会话状态", flush=True)
    else:
        print("[TTS Cache] 精选音频模式，跳过语料预缓存", flush=True)

    runtime.ready = True
    runtime.voice_forge_review_pending = False
    print("[TTS] 服务就绪", flush=True)


def shutdown(runtime: AppRuntime) -> None:
    """P4：进程退出时释放引擎（预留扩展点）。"""
    from engines.runtime_isolation import release_engine_runtime

    release_engine_runtime()
    runtime.engine = None
    runtime.cache_manager = None
