"""
雪澜赛博猫娘 - TTS 服务

引擎由 tts_voice/config.yaml 配置，经 engines/ 统一注册表加载。
触摸反馈模式见 touch_mode_config.py。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

import threading

from audio_cache import AudioCacheManager
from engine_factory import QWEN_CONFIG_PATH, create_engine
from engines.registry import engine_supports_voice_forge, read_engine_name, resolve_engine_asset_paths
from qwen_clone_setup import (
    base_model_dir,
    consume_regenerate_flag,
    generate_reference_clip,
    load_reference,
    require_clone_reference_files,
)
from touch_mode_config import is_corpus_touch_mode, read_touch_mode, resolve_corpus_path, write_touch_mode
from voice_forge_config import load_merged_qwen_settings
from voice_forge_paths import (
    ALT_ENGINE_PREWARM_TARGET,
    alt_engine_corpus_snapshot_path,
    alt_engine_touch_cache_dir,
    corpus_snapshot_path,
    get_active_sample_info,
    read_touch_cache_pointer,
    resolve_corpus_path_for_sample,
    resolve_active_sample_dir,
    resolve_sample_dir,
    touch_cache_dir_for_sample,
    write_touch_cache_pointer,
    consume_corpus_prewarm_flag,
    read_realtime_inference_enabled,
)
from voice_runtime_repair import reconcile_runtime_voice_config
from voice_forge_session import (
    PHASE_AWAITING_REVIEW,
    PHASE_GENERATING,
    PHASE_PENDING_RESTART,
    PHASE_PREWARMING,
    clear_session,
    finish_session_cancelled,
    finish_session_success,
    is_awaiting_review,
    read_session,
    should_run_create_voice_flow,
    should_show_review_ui,
    update_session,
)

app = FastAPI(title="Xue Cyber Neko TTS", version="0.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
backend_name = "unknown"
touch_mode = "curated"
engine = None
ready = False
cache_manager: AudioCacheManager | None = None
voice_forge_review_pending = False
_create_voice_lock = threading.Lock()
_touch_mode_sync_lock = threading.Lock()
_touch_mode_sync_running = False
_touch_mode_sync_generation = 0
_cached_sample_id: str | None = None
_corpus_prewarm_must_block = False
_offline_prewarm_manager: AudioCacheManager | None = None
_offline_prewarm_folder_id: str | None = None


def _bump_touch_mode_sync_generation() -> int:
    global _touch_mode_sync_generation
    _touch_mode_sync_generation += 1
    return _touch_mode_sync_generation


def _touch_mode_sync_stale(generation: int) -> bool:
    return generation != _touch_mode_sync_generation


def _active_folder_id() -> str | None:
    active = get_active_sample_info()
    if not isinstance(active, dict):
        return None
    folder_id = active.get("folderId")
    return folder_id.strip() if isinstance(folder_id, str) and folder_id.strip() else None


def _refresh_touch_mode_from_disk(*, reconcile: bool = False) -> str:
    """进程内 touch_mode 仅在启动/同步时更新；上传试听等流程会改磁盘，需显式刷新。"""
    global touch_mode
    next_mode = reconcile_runtime_voice_config() if reconcile else read_touch_mode()
    if next_mode != touch_mode:
        print(f"[TTS] 触摸模式同步: {touch_mode} -> {next_mode}", flush=True)
    touch_mode = next_mode
    return touch_mode


def _is_alt_engine_corpus_mode(mode: str | None = None) -> bool:
    current = mode or touch_mode
    return current == "alt_engine_corpus"


def _uses_private_engine_cache() -> bool:
    """Bert 等私有引擎语料缓存放在 other_custom_cache/{engine}/，与 Qwen 声线 touch_cache 分离。"""
    return not engine_supports_voice_forge(backend_name)


def _resolve_private_engine_corpus_path() -> Path:
    snapshot = alt_engine_corpus_snapshot_path(backend_name)
    if snapshot.is_file():
        return snapshot
    sample_dir = resolve_active_sample_dir()
    if sample_dir is not None:
        sample_snapshot = corpus_snapshot_path(sample_dir)
        if sample_snapshot.is_file():
            return sample_snapshot
    return resolve_corpus_path()


def _private_engine_cache_kwargs() -> dict[str, Any]:
    cache_dir = alt_engine_touch_cache_dir(backend_name)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return {
        "cache_dir": cache_dir,
        "corpus_path": _resolve_private_engine_corpus_path(),
        "backend": backend_name,
        **_private_engine_cache_paths(),
    }


def _qwen_model_dir_for_cache_probe(current_engine: Any | None = None) -> Path | None:
    probe_engine = current_engine if current_engine is not None else engine
    model_dir = getattr(probe_engine, "model_dir", None) if probe_engine is not None else None
    if model_dir is not None:
        return model_dir
    if not QWEN_CONFIG_PATH.is_file():
        return None
    try:
        import json

        settings = json.loads(QWEN_CONFIG_PATH.read_text(encoding="utf-8"))
        return base_model_dir(settings)
    except Exception:  # noqa: BLE001
        return None


def _engine_sample_dir() -> Path | None:
    if engine is None:
        return None
    ref = getattr(engine, "clone_reference_path", None)
    if ref is None:
        return None
    try:
        path = Path(ref).resolve()
    except OSError:
        return None
    if not path.is_file():
        return None
    return path.parent


def _runtime_matches_active_sample() -> bool:
    if _uses_private_engine_cache():
        return engine is not None
    active_dir = resolve_active_sample_dir()
    engine_dir = _engine_sample_dir()
    if active_dir is None or engine_dir is None:
        return False
    return active_dir.resolve() == engine_dir.resolve()


def _invalidate_voice_runtime(reason: str = "") -> None:
    global engine, cache_manager, _cached_sample_id
    if reason:
        print(f"[TTS] {reason}，卸载旧克隆引擎", flush=True)
    engine = None
    cache_manager = None
    _cached_sample_id = None


def _resolve_cache_manager_for_active() -> AudioCacheManager | None:
    if _uses_private_engine_cache():
        if (
            cache_manager is not None
            and cache_manager.cache_dir == alt_engine_touch_cache_dir(backend_name)
        ):
            return cache_manager
        return _probe_alt_engine_cache_manager(current_engine=engine)

    folder_id = _active_folder_id()
    if (
        cache_manager is not None
        and folder_id
        and folder_id == _cached_sample_id
        and _runtime_matches_active_sample()
    ):
        return cache_manager
    return _probe_sample_cache_manager(folder_id, current_engine=engine)


def _probe_sample_cache_manager(
    folder_id: str | None = None,
    *,
    current_engine: Any | None = None,
) -> AudioCacheManager | None:
    if backend_name != "qwen":
        return None
    sample_dir = resolve_active_sample_dir() if not folder_id else None
    if folder_id:
        from voice_forge_paths import resolve_sample_dir

        sample_dir = resolve_sample_dir(folder_id)
    if sample_dir is None:
        return None
    cache_dir = touch_cache_dir_for_sample(sample_dir)
    corpus_path = resolve_corpus_path_for_sample(sample_dir)
    if not corpus_path.is_file():
        return None
    kwargs: dict = {
        "cache_dir": cache_dir,
        "corpus_path": corpus_path,
        "backend": backend_name,
    }
    if backend_name == "qwen":
        kwargs["qwen_config_path"] = QWEN_CONFIG_PATH
        ref_wav = sample_dir / "reference.wav"
        if ref_wav.is_file():
            kwargs["qwen_clone_ref"] = ref_wav
        model_dir = _qwen_model_dir_for_cache_probe(current_engine)
        if model_dir is not None:
            kwargs["qwen_model_dir"] = model_dir
    return AudioCacheManager(**kwargs)


def _private_engine_cache_paths() -> dict[str, Path]:
    assets = resolve_engine_asset_paths(backend_name)
    paths: dict[str, Path] = {}
    config_path = assets.get("config_path")
    model_path = assets.get("model_path")
    if config_path is not None:
        paths["config_path"] = config_path
    if model_path is not None:
        paths["model_path"] = model_path
    return paths


def _probe_alt_engine_cache_manager(*, current_engine: Any | None = None) -> AudioCacheManager | None:
    if engine_supports_voice_forge(backend_name):
        return None
    corpus_path = _resolve_private_engine_corpus_path()
    if not corpus_path.is_file():
        return None
    return AudioCacheManager(**_private_engine_cache_kwargs())


def _build_cache_manager(current_engine) -> AudioCacheManager:
    if _uses_private_engine_cache():
        return AudioCacheManager(**_private_engine_cache_kwargs())

    if _is_alt_engine_corpus_mode():
        raise RuntimeError("Qwen 引擎请使用音色工坊 custom_corpus，而非 alt_engine_corpus")

    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        raise RuntimeError("未选择激活的克隆声线，无法构建语料缓存")

    cache_dir = touch_cache_dir_for_sample(sample_dir)
    corpus_path = resolve_corpus_path_for_sample(sample_dir)
    cache_kwargs: dict = {
        "cache_dir": cache_dir,
        "corpus_path": corpus_path,
        "backend": backend_name,
        "qwen_config_path": QWEN_CONFIG_PATH,
        "qwen_model_dir": current_engine.model_dir,
    }
    clone_ref = getattr(current_engine, "clone_reference_path", None)
    if clone_ref is not None:
        cache_kwargs["qwen_clone_ref"] = clone_ref
    return AudioCacheManager(**cache_kwargs)


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=200)
    speaker_id: int = 0
    seed: int | None = None


class VoiceForgeRejectRequest(BaseModel):
    action: str = Field(..., pattern="^(regenerate|skip)$")


def _load_clone_engine(*, force_regenerate: bool = False):
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


def _load_clone_engine_for_sample_dir(sample_dir: Path):
    """为指定声线目录加载克隆引擎（不依赖 voice-forge.json 的 activeSample）。"""
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


def _prewarm_sample_cache_offline(folder_id: str) -> None:
    """仅预热指定声线目录的 touch_cache，不切换当前激活声线与已加载引擎。"""
    global _offline_prewarm_manager, _offline_prewarm_folder_id

    if folder_id == ALT_ENGINE_PREWARM_TARGET:
        raise RuntimeError("第三方引擎语料请走 alt_engine_corpus 同步流程")

    sample_dir = resolve_sample_dir(folder_id)
    if sample_dir is None:
        raise RuntimeError(f"未找到声线目录: {folder_id}")

    corpus_path = resolve_corpus_path_for_sample(sample_dir)
    if not corpus_path.is_file():
        raise RuntimeError(f"声线 {folder_id} 缺少语料快照")

    ref_wav = sample_dir / "reference.wav"
    if not ref_wav.is_file():
        raise RuntimeError(f"声线 {folder_id} 尚未生成参考音频")

    _offline_prewarm_folder_id = folder_id
    temp_engine = None
    manager: AudioCacheManager | None = None
    try:
        temp_engine = _load_clone_engine_for_sample_dir(sample_dir)
        manager = _probe_sample_cache_manager(folder_id, current_engine=temp_engine)
        if manager is None:
            raise RuntimeError(f"无法构建声线 {folder_id} 的语料缓存管理器")

        _offline_prewarm_manager = manager
        if manager.is_cache_valid():
            write_touch_cache_pointer(
                sample_dir,
                source_hash=manager.compute_source_hash(),
                ready=True,
                line_count=len(manager.collect_lines()),
            )
            print(f"[TTS Cache] 声线 {folder_id} 语料缓存已是最新，跳过预热", flush=True)
            return

        print(
            f"[TTS Cache] 离线增量预热声线 {folder_id}（不影响当前激活声线）…",
            flush=True,
        )
        manager.build_sync(temp_engine)
        print(f"[TTS Cache] 声线 {folder_id} 离线语料预热完成", flush=True)
    finally:
        _offline_prewarm_manager = None
        if temp_engine is not None:
            model = getattr(temp_engine, "_model", None)
            del temp_engine
            try:
                from qwen_clone_setup import _unload_model

                _unload_model(model)
            except Exception:  # noqa: BLE001
                pass


def _run_create_voice_reference_generation() -> None:
    global voice_forge_review_pending

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
    voice_forge_review_pending = True


def _schedule_create_voice_reference_generation() -> bool:
    """后台生成克隆参考音；若已在运行或无需生成则返回 False。"""
    session = read_session()
    if not should_run_create_voice_flow(session):
        return False
    if not _create_voice_lock.acquire(blocking=False):
        print("[TTS/VoiceForge] 创建流程已在运行，跳过重复请求", flush=True)
        return True

    def _runner() -> None:
        global ready, voice_forge_review_pending
        try:
            _run_create_voice_reference_generation()
            ready = True
            print("[TTS/VoiceForge] 克隆参考音已生成，等待试听", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS/VoiceForge] 生成克隆参考音失败: {error}", flush=True)
            update_session(phase=PHASE_PENDING_RESTART)
        finally:
            _create_voice_lock.release()

    threading.Thread(target=_runner, name="voice-forge-create", daemon=True).start()
    return True


def _prewarm_corpus_cache(current_engine, *, blocking: bool | None = None) -> None:
    global cache_manager, _cached_sample_id, _corpus_prewarm_must_block

    must_block = blocking if blocking is not None else _corpus_prewarm_must_block

    _refresh_touch_mode_from_disk(reconcile=True)
    if not is_corpus_touch_mode():
        print("[TTS Cache] 当前非语料模式，跳过预热", flush=True)
        _corpus_prewarm_must_block = False
        return

    if _uses_private_engine_cache():
        cache_manager = _build_cache_manager(current_engine)
        _cached_sample_id = None
        print(
            f"[TTS Cache] 预热第三方引擎语料 · engine={backend_name} · "
            f"缓存目录={alt_engine_touch_cache_dir(backend_name)}",
            flush=True,
        )
    else:
        sample_dir = resolve_active_sample_dir()
        active = get_active_sample_info()
        ref = getattr(current_engine, "clone_reference_path", None)
        if sample_dir is not None:
            print(
                f"[TTS Cache] 预热声线: {sample_dir.name} · "
                f"active={active} · 参考音={ref} · 缓存目录={touch_cache_dir_for_sample(sample_dir)}",
                flush=True,
            )

        cache_manager = _build_cache_manager(current_engine)
        _cached_sample_id = _active_folder_id()
    if cache_manager.is_cache_valid():
        if _uses_private_engine_cache():
            print("[TTS Cache] 第三方引擎语料缓存已有效，跳过预热", flush=True)
            _corpus_prewarm_must_block = False
            return
        sample_dir = resolve_active_sample_dir()
        if sample_dir is not None:
            write_touch_cache_pointer(
                sample_dir,
                source_hash=cache_manager.compute_source_hash(),
                ready=True,
                line_count=len(cache_manager.collect_lines()),
            )
        print("[TTS Cache] 该声线仓库已有有效缓存，跳过预热", flush=True)
        _corpus_prewarm_must_block = False
        return
    if read_realtime_inference_enabled() and not must_block:
        print(
            "[TTS Cache] 实时推理已开启，克隆引擎就绪；语料缓存将在后台预热（不阻塞点击合成）",
            flush=True,
        )
        cache_manager.build_async(current_engine)
        return
    print("[TTS Cache] 检测到语料或声线变更，开始预热...", flush=True)
    cache_manager.build_sync(current_engine)
    _corpus_prewarm_must_block = False


@app.on_event("startup")
def load_model() -> None:
    global backend_name, touch_mode, engine, ready, cache_manager, voice_forge_review_pending, _cached_sample_id

    backend_name = read_engine_name()
    touch_mode = reconcile_runtime_voice_config()
    corpus_path = resolve_corpus_path()
    session = read_session()

    print(f"[TTS] 当前后端: {backend_name}", flush=True)
    print(f"[TTS] 触摸模式: {touch_mode}", flush=True)

    use_qwen_clone = engine_supports_voice_forge(backend_name) and touch_mode == "custom_corpus"
    force_regenerate_voice = consume_regenerate_flag()

    if use_qwen_clone and should_run_create_voice_flow(session):
        if _schedule_create_voice_reference_generation():
            ready = True
            print("[TTS] 正在后台生成克隆参考音（音色工坊）", flush=True)
        else:
            ready = True
            print("[TTS] 克隆参考音已存在或无需生成", flush=True)
        return

    if use_qwen_clone and is_awaiting_review(session):
        voice_forge_review_pending = True
        ready = True
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
    _, engine = create_engine()
    engine.warmup()

    if is_corpus_touch_mode(touch_mode) and corpus_path.is_file():
        if _is_alt_engine_corpus_mode() and engine_supports_voice_forge(backend_name):
            print("[TTS Cache] Qwen 引擎不应使用 alt_engine_corpus，已回退精选音频模式", flush=True)
            write_touch_mode("curated")
            touch_mode = "curated"
            engine = None
            cache_manager = None
        else:
            try:
                _prewarm_corpus_cache(engine)
            except Exception as error:  # noqa: BLE001
                print(f"[TTS Cache] 语料预热失败，已回退精选音频模式: {error}", flush=True)
                write_touch_mode("curated")
                touch_mode = "curated"
                engine = None
                cache_manager = None
                clear_session()
            else:
                session_after = read_session()
                if (
                    session_after
                    and session_after.get("phase") == PHASE_PREWARMING
                    and cache_manager is not None
                    and cache_manager.is_cache_valid()
                ):
                    finish_session_success()
                    print("[TTS/VoiceForge] 检测到上次预热已完成，已清理会话状态", flush=True)
    else:
        print("[TTS Cache] 精选音频模式，跳过语料预缓存", flush=True)

    ready = True
    voice_forge_review_pending = False
    print("[TTS] 服务就绪", flush=True)


@app.get("/health")
def health():
    _refresh_touch_mode_from_disk()
    payload = {
        "status": "ok" if ready else "loading",
        "backend": backend_name,
        "configured_engine": read_engine_name(),
        "voice_forge_supported": engine_supports_voice_forge(backend_name),
        "touch_mode": touch_mode,
        "engine": engine is not None,
        "ready": ready,
        "voice_forge_review_pending": voice_forge_review_pending,
        "sync_running": _touch_mode_sync_running,
        "prewarm_active": _is_prewarm_active(),
        "engine_matches_active": _runtime_matches_active_sample() if engine is not None else False,
        "sample_folder_id": _active_folder_id(),
    }
    if cache_manager is not None:
        payload["cache"] = cache_manager.status()
    session = read_session()
    if session:
        payload["voice_forge"] = {
            "phase": session.get("phase"),
            "flow": session.get("flow"),
            "displayName": session.get("displayName"),
            "folderId": session.get("folderId"),
        }
    return payload


@app.post("/voice-forge/resume-pending")
def voice_forge_resume_pending():
    """Electron 写入 pending_restart 会话后调用；无需重启 TTS 进程即可开始生成克隆参考音。"""
    global touch_mode

    session = read_session()
    if not should_run_create_voice_flow(session):
        return {"ok": False, "detail": "没有待处理的创建会话，或参考音已生成"}

    touch_mode = read_touch_mode()
    if not engine_supports_voice_forge(backend_name) or touch_mode != "custom_corpus":
        return {
            "ok": False,
            "detail": f"当前模式不支持创建声线（engine={backend_name}, touch_mode={touch_mode}）",
        }

    started = _schedule_create_voice_reference_generation()
    return {"ok": True, "phase": PHASE_GENERATING, "already_running": not started}


@app.post("/voice-forge/upload-ready")
def voice_forge_upload_ready():
    """Electron 写入上传参考音并进入 awaiting_review 后调用。"""
    global voice_forge_review_pending, touch_mode

    _refresh_touch_mode_from_disk(reconcile=True)

    session = read_session()
    if not session or session.get("source") != "upload":
        return {"ok": False, "detail": "没有待试听的上传会话"}

    if session.get("phase") != PHASE_AWAITING_REVIEW:
        update_session(phase=PHASE_AWAITING_REVIEW)

    try:
        require_clone_reference_files()
    except RuntimeError as error:
        return {"ok": False, "detail": str(error)}

    voice_forge_review_pending = True
    print("[TTS/VoiceForge] 用户上传参考音已就绪，等待试听确认", flush=True)
    return {"ok": True, "phase": PHASE_AWAITING_REVIEW}


@app.get("/voice-forge/status")
def voice_forge_status():
    session = read_session()
    sample_dir = resolve_active_sample_dir()
    ref_ready = False
    if sample_dir is not None:
        try:
            load_reference(sample_dir)
            ref_ready = True
        except OSError:
            ref_ready = False
    return {
        "review_pending": voice_forge_review_pending and should_show_review_ui(session),
        "phase": session.get("phase") if session else None,
        "flow": session.get("flow") if session else None,
        "source": session.get("source") if session else None,
        "displayName": session.get("displayName") if session else None,
        "folderId": session.get("folderId") if session else None,
        "reference_ready": ref_ready,
        "ready": ready,
    }


@app.get("/voice-forge/preview-audio")
def voice_forge_preview_audio():
    if not voice_forge_review_pending:
        raise HTTPException(status_code=404, detail="当前无需试听")
    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        raise HTTPException(status_code=404, detail="未找到克隆样本")
    try:
        ref_wav, _ = load_reference(sample_dir)
    except OSError as error:
        raise HTTPException(status_code=404, detail="参考音频不存在") from error
    return Response(content=ref_wav.read_bytes(), media_type="audio/wav")


@app.post("/voice-forge/approve")
def voice_forge_approve():
    global engine, ready, voice_forge_review_pending, cache_manager, touch_mode

    session = read_session()
    if not voice_forge_review_pending or not is_awaiting_review(session):
        raise HTTPException(status_code=400, detail="当前不在试听确认阶段")

    _refresh_touch_mode_from_disk(reconcile=True)
    if touch_mode != "custom_corpus":
        raise HTTPException(status_code=400, detail="当前不是自定义语料模式，无法开始语料预热")

    update_session(phase=PHASE_PREWARMING)
    voice_forge_review_pending = False
    print("[TTS/VoiceForge] 用户满意，开始预热语料库...", flush=True)

    try:
        engine = _load_clone_engine()
    except Exception as error:  # noqa: BLE001
        voice_forge_review_pending = True
        update_session(phase=PHASE_AWAITING_REVIEW)
        raise HTTPException(status_code=500, detail=str(error)) from error

    from voice_forge_paths import read_voice_forge_config, write_voice_forge_config_patch

    config = read_voice_forge_config()
    active = config.get("activeSample")
    if isinstance(active, dict):
        write_voice_forge_config_patch({"activeSample": {**active, "pending": False}})

    def _prewarm_runner() -> None:
        global ready, cache_manager, voice_forge_review_pending
        try:
            _prewarm_corpus_cache(engine)
            finish_session_success()
            ready = True
            print("[TTS/VoiceForge] 语料预热完成，音色工坊已启用", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS/VoiceForge] 语料预热失败: {error}", flush=True)
            update_session(phase=PHASE_AWAITING_REVIEW)
            voice_forge_review_pending = True

    threading.Thread(target=_prewarm_runner, name="voice-forge-prewarm", daemon=True).start()
    return {"ok": True, "phase": PHASE_PREWARMING}


@app.post("/voice-forge/reject")
def voice_forge_reject(request: VoiceForgeRejectRequest):
    global engine, ready, cache_manager, voice_forge_review_pending, touch_mode

    session = read_session()
    if not voice_forge_review_pending or not is_awaiting_review(session):
        raise HTTPException(status_code=400, detail="当前不在试听确认阶段")

    if request.action == "regenerate":
        if session.get("source") == "upload":
            raise HTTPException(
                status_code=400,
                detail="上传参考音不支持 VoiceDesign 重新生成，请返回音色工坊重新上传",
            )
        update_session(phase=PHASE_GENERATING)
        settings = load_merged_qwen_settings(QWEN_CONFIG_PATH)
        sample_dir = resolve_active_sample_dir()
        if sample_dir is None:
            raise HTTPException(status_code=500, detail="未找到克隆样本目录")
        generate_reference_clip(
            settings,
            sample_dir,
            display_name=session.get("displayName"),
            folder_id=session.get("folderId"),
        )
        update_session(phase=PHASE_AWAITING_REVIEW)
        voice_forge_review_pending = True
        ready = True
        return {"ok": True, "phase": PHASE_AWAITING_REVIEW}

    _refresh_touch_mode_from_disk(reconcile=True)
    write_touch_mode("curated")
    touch_mode = "curated"
    engine = None
    cache_manager = None
    clear_session()
    voice_forge_review_pending = False
    ready = True
    print("[TTS/VoiceForge] 用户跳过，已恢复精选音频模式", flush=True)
    return {"ok": True, "phase": "cancelled", "touch_mode": "curated"}


def _is_prewarm_active() -> bool:
    if _touch_mode_sync_running:
        return True
    if _offline_prewarm_manager is not None and _offline_prewarm_manager._building:
        return True
    if cache_manager is not None and cache_manager._building:
        return True
    return False


def _custom_corpus_runtime_ready() -> bool:
    return (
        engine is not None
        and _runtime_matches_active_sample()
        and cache_manager is not None
        and cache_manager.is_cache_valid()
    )


@app.post("/touch-mode/sync")
def sync_touch_mode():
    """读取磁盘上的触摸模式并同步到运行中的 TTS（切换声线后调用）。"""
    global touch_mode, engine, ready, cache_manager, voice_forge_review_pending, _cached_sample_id, _touch_mode_sync_running, _corpus_prewarm_must_block

    new_mode = reconcile_runtime_voice_config()
    active_id = _active_folder_id()

    corpus_target_id = consume_corpus_prewarm_flag()
    corpus_prewarm_requested = corpus_target_id is not None
    offline_prewarm = False

    if corpus_prewarm_requested:
        _corpus_prewarm_must_block = True
        active_id = _active_folder_id() or None

        if (
            corpus_target_id == ALT_ENGINE_PREWARM_TARGET
            or _uses_private_engine_cache()
        ):
            offline_prewarm = False
            cache_manager = None
            keep_loaded_engine = engine is not None and _uses_private_engine_cache()
            if not keep_loaded_engine:
                _invalidate_voice_runtime("检测到语料预热请求")
        elif active_id and corpus_target_id != active_id:
            offline_prewarm = True
        else:
            cache_manager = None
            keep_loaded_engine = engine is not None and (
                _uses_private_engine_cache()
                or (new_mode == "custom_corpus" and _runtime_matches_active_sample())
            )
            if keep_loaded_engine:
                print("[TTS] 语料变更：保留已加载引擎，仅增量预热变更句子", flush=True)
            else:
                _invalidate_voice_runtime("检测到语料预热请求")

    if offline_prewarm:
        if not _touch_mode_sync_lock.acquire(blocking=False):
            print("[TTS] 语料同步已在运行，跳过重复请求", flush=True)
            return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": False}

        sync_generation = _bump_touch_mode_sync_generation()

        def _offline_prewarm_runner() -> None:
            global _touch_mode_sync_running, _corpus_prewarm_must_block, _offline_prewarm_folder_id
            _touch_mode_sync_running = True
            _offline_prewarm_folder_id = corpus_target_id
            try:
                if _touch_mode_sync_stale(sync_generation):
                    print("[TTS Cache] 离线语料预热已取消（模式已切换）", flush=True)
                    return
                print(
                    f"[TTS Cache] 离线预热目标={corpus_target_id} · "
                    f"保持当前激活声线={active_id} · touch_mode={touch_mode}",
                    flush=True,
                )
                _prewarm_sample_cache_offline(corpus_target_id or "")
            except Exception as error:  # noqa: BLE001
                print(f"[TTS Cache] 离线语料预热失败: {error}", flush=True)
            finally:
                _touch_mode_sync_running = False
                _corpus_prewarm_must_block = False
                _offline_prewarm_folder_id = None
                _touch_mode_sync_lock.release()

        threading.Thread(
            target=_offline_prewarm_runner,
            name="touch-mode-offline-prewarm",
            daemon=True,
        ).start()
        return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": False}

    if new_mode == "custom_corpus":
        if (
            active_id
            and _cached_sample_id
            and active_id != _cached_sample_id
        ):
            _invalidate_voice_runtime(f"激活声线切换为 {active_id}")
        elif engine is not None and not _runtime_matches_active_sample():
            _invalidate_voice_runtime("激活声线与已加载克隆不一致")

    if new_mode == touch_mode and not corpus_prewarm_requested:
        if new_mode == "curated":
            return {"ok": True, "touch_mode": touch_mode, "prewarm": False, "changed": False}
        if _custom_corpus_runtime_ready():
            if _is_prewarm_active():
                return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": False}
            return {"ok": True, "touch_mode": touch_mode, "prewarm": False, "changed": False}
        if _touch_mode_sync_running:
            return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": False}
        if (
            engine is not None
            and _runtime_matches_active_sample()
            and _is_prewarm_active()
        ):
            return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": False}

    touch_mode = new_mode

    if touch_mode == "curated":
        _bump_touch_mode_sync_generation()
        _invalidate_voice_runtime()
        voice_forge_review_pending = False
        ready = True
        print("[TTS] 已同步为精选音频模式", flush=True)
        return {"ok": True, "touch_mode": touch_mode, "prewarm": False, "changed": True}

    will_prewarm = True
    if not corpus_prewarm_requested:
        if _uses_private_engine_cache():
            probe = _probe_alt_engine_cache_manager()
        else:
            probe = _probe_sample_cache_manager(active_id) if active_id else None
        if probe is not None and probe.is_cache_valid():
            will_prewarm = False

    if not _touch_mode_sync_lock.acquire(blocking=False):
        print("[TTS] 语料同步已在运行，跳过重复请求", flush=True)
        return {"ok": True, "touch_mode": touch_mode, "prewarm": True, "changed": True}

    sync_generation = _bump_touch_mode_sync_generation()

    def _sync_alt_engine_runner() -> None:
        global engine, ready, cache_manager, _cached_sample_id, _touch_mode_sync_running
        _touch_mode_sync_running = True
        try:
            if _touch_mode_sync_stale(sync_generation):
                print("[TTS] 第三方语料同步已取消（模式已切换）", flush=True)
                return
            if engine is None:
                print(
                    f"[TTS] 检测到第三方引擎语料模式，正在加载 {backend_name} …",
                    flush=True,
                )
                _, engine = create_engine()
                engine.warmup()
            else:
                print(f"[TTS] 第三方引擎已就绪，开始增量预热语料 …", flush=True)
            _refresh_touch_mode_from_disk(reconcile=True)
            if _touch_mode_sync_stale(sync_generation) or not _uses_private_engine_cache():
                print("[TTS] 第三方语料同步已取消（模式已切换）", flush=True)
                return
            _prewarm_corpus_cache(engine)
            ready = True
            print("[TTS] 第三方引擎语料预热完成", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS] 第三方引擎语料同步失败: {error}", flush=True)
        finally:
            _touch_mode_sync_running = False
            _touch_mode_sync_lock.release()

    def _sync_clone_runner() -> None:
        global engine, ready, cache_manager, _cached_sample_id, _touch_mode_sync_running
        _touch_mode_sync_running = True
        try:
            if _touch_mode_sync_stale(sync_generation):
                print("[TTS] 语料同步已取消（模式已切换）", flush=True)
                return
            active = get_active_sample_info()
            if engine is None or not _runtime_matches_active_sample():
                print(
                    f"[TTS] 检测到自定义语料模式，正在加载克隆声线… active={active} folderId={_active_folder_id()}",
                    flush=True,
                )
                require_clone_reference_files()
                engine = _load_clone_engine()
                ref = getattr(engine, "clone_reference_path", None)
                print(
                    f"[TTS] 克隆引擎已挂载 · 参考音={ref} · 匹配激活目录={_runtime_matches_active_sample()}",
                    flush=True,
                )
            else:
                print(
                    f"[TTS] 克隆引擎已就绪，开始增量预热语料 … active={active} folderId={_active_folder_id()}",
                    flush=True,
                )
            _refresh_touch_mode_from_disk(reconcile=True)
            if _touch_mode_sync_stale(sync_generation) or not is_corpus_touch_mode(touch_mode):
                print("[TTS] 语料同步已取消（模式已切换）", flush=True)
                return
            _prewarm_corpus_cache(engine)
            ready = True
            print("[TTS] 克隆声线切换完成", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS] 克隆声线切换失败: {error}", flush=True)
        finally:
            _touch_mode_sync_running = False
            _touch_mode_sync_lock.release()

    runner = _sync_alt_engine_runner if _uses_private_engine_cache() else _sync_clone_runner
    threading.Thread(target=runner, name="touch-mode-sync", daemon=True).start()
    ready = True
    return {"ok": True, "touch_mode": touch_mode, "prewarm": will_prewarm, "changed": True}


def _apply_sync_prewarm_status(status: dict[str, Any], probe: Any | None = None) -> dict[str, Any]:
    """同步克隆引擎阶段：标记预热中，并用本次实际工作量修正进度总数。"""
    manager = probe
    if manager is None:
        return status

    work_lines, work_total = manager.estimate_prewarm_work()
    done = manager._progress_done if manager._building else 0
    total = manager._progress_total if manager._progress_total > 0 else work_total

    status["ready"] = False
    status["building"] = True
    status["prewarm_work_lines"] = len(work_lines)
    status["prewarm_work_total"] = work_total
    status["progress"] = {"done": done, "total": total}
    status["message"] = "正在预热语料库喵~"
    return status


@app.get("/cache/status")
def cache_status():
    _refresh_touch_mode_from_disk()
    folder_id = _active_folder_id()

    if _offline_prewarm_manager is not None:
        status = _offline_prewarm_manager.status()
        status["touch_mode"] = touch_mode
        status["sample_folder_id"] = _offline_prewarm_folder_id or folder_id
        status["cache_dir"] = str(_offline_prewarm_manager.cache_dir)
        status["prewarm_active"] = _is_prewarm_active()
        status["offline_prewarm"] = True
        status["message"] = "正在离线预热语料库喵~"
        if _touch_mode_sync_running and not _offline_prewarm_manager._building:
            status = _apply_sync_prewarm_status(status, _offline_prewarm_manager)
        return status

    if _offline_prewarm_folder_id and _touch_mode_sync_running:
        probe = _probe_sample_cache_manager(_offline_prewarm_folder_id)
        return _apply_sync_prewarm_status(
            {
                "backend": backend_name,
                "ready": False,
                "building": True,
                "stale": False,
                "touch_mode": touch_mode,
                "sample_folder_id": _offline_prewarm_folder_id,
                "prewarm_active": True,
                "offline_prewarm": True,
                "progress": {"done": 0, "total": 0},
                "message": "正在加载克隆引擎以离线预热语料…",
            },
            probe,
        )

    if cache_manager is not None:
        status = cache_manager.status()
        status["touch_mode"] = touch_mode
        status["sample_folder_id"] = folder_id
        status["cache_dir"] = str(cache_manager.cache_dir)
        sample_dir = resolve_active_sample_dir()
        if sample_dir is not None:
            status["cache_pointer"] = read_touch_cache_pointer(sample_dir)
        status["prewarm_active"] = _is_prewarm_active()
        if _touch_mode_sync_running and not cache_manager._building:
            status = _apply_sync_prewarm_status(status, cache_manager)
        return status

    if is_corpus_touch_mode(touch_mode):
        probe = None
        if _touch_mode_sync_running:
            if _uses_private_engine_cache():
                probe = _probe_alt_engine_cache_manager()
            else:
                probe = _probe_sample_cache_manager(folder_id)
            total = 0
            done = 0
            work_lines = 0
            if probe is not None:
                lines, total = probe.estimate_prewarm_work()
                work_lines = len(lines)
            return _apply_sync_prewarm_status(
                {
                    "backend": backend_name,
                    "ready": False,
                    "building": True,
                    "stale": False,
                    "touch_mode": touch_mode,
                    "sample_folder_id": folder_id,
                    "prewarm_active": True,
                    "progress": {"done": done, "total": total},
                    "prewarm_work_lines": work_lines,
                    "prewarm_work_total": total,
                },
                probe,
            )
        if _uses_private_engine_cache():
            probe = _probe_alt_engine_cache_manager()
        else:
            probe = _probe_sample_cache_manager(folder_id)
        if probe is not None and probe.is_cache_valid():
            status = probe.status()
            status["touch_mode"] = touch_mode
            status["sample_folder_id"] = folder_id
            status["cache_dir"] = str(probe.cache_dir)
            if not _uses_private_engine_cache():
                sample_dir = resolve_active_sample_dir()
                if sample_dir is not None:
                    status["cache_pointer"] = read_touch_cache_pointer(sample_dir)
            status["prewarm_active"] = _is_prewarm_active()
            status["message"] = (
                "第三方引擎语料缓存已就绪，等待 TTS 引擎挂载"
                if _uses_private_engine_cache()
                else "该声线仓库已有预热缓存，等待 TTS 引擎挂载"
            )
            return status
        return {
            "backend": backend_name,
            "ready": False,
            "building": False,
            "stale": True,
            "touch_mode": touch_mode,
            "sample_folder_id": folder_id,
            "prewarm_active": _is_prewarm_active(),
            "progress": {"done": 0, "total": 0},
            "message": (
                "第三方引擎语料模式，尚未预热"
                if _uses_private_engine_cache()
                else "自定义语料模式，该声线仓库尚未预热"
            ),
        }
    return {
        "backend": backend_name,
        "ready": False,
        "building": False,
        "stale": True,
        "touch_mode": touch_mode,
        "prewarm_active": False,
        "progress": {"done": 0, "total": 0},
        "message": "当前为精选音频模式，未启用语料缓存",
    }


@app.post("/cache/rebuild")
def cache_rebuild():
    if engine is None or cache_manager is None:
        raise HTTPException(status_code=503, detail="语料缓存未启用（精选音频模式）")
    cache_manager.build_async(engine)
    return cache_manager.status()


@app.get("/cache/audio")
def cache_audio(text: str, variant: int | None = None):
    _refresh_touch_mode_from_disk()
    if not is_corpus_touch_mode():
        raise HTTPException(status_code=503, detail="语料缓存未启用")
    manager = _resolve_cache_manager_for_active()
    if manager is None:
        raise HTTPException(status_code=503, detail="语料缓存未启用")

    path = manager.resolve_wav_path(text, variant, allow_partial=True)
    if path is not None:
        return Response(content=path.read_bytes(), media_type="audio/wav")

    if _is_prewarm_active():
        raise HTTPException(status_code=503, detail="语料缓存正在加载，请稍候")
    if engine is None or not _runtime_matches_active_sample():
        raise HTTPException(status_code=503, detail="克隆声线正在切换，请稍候")
    raise HTTPException(status_code=404, detail="该句暂无缓存，可能仍在生成中")


@app.post("/tts")
def tts(request: TtsRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="TTS 引擎尚未就绪")
    if is_corpus_touch_mode() and not _uses_private_engine_cache() and not _runtime_matches_active_sample():
        raise HTTPException(status_code=503, detail="克隆声线正在切换，请稍候")

    try:
        wav_bytes = engine.synthesize(request.text, request.speaker_id, seed=request.seed)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(error)) from error

    return Response(content=wav_bytes, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
