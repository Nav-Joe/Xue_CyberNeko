"""语料 cache 创建、探测、预热（P4）。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from audio_cache import AudioCacheManager
from engine_factory import QWEN_CONFIG_PATH
from engines.registry import engine_supports_voice_forge, resolve_engine_asset_paths
from qwen_clone_setup import base_model_dir
from services.engine_lifecycle import (
    active_folder_id,
    is_alt_engine_corpus_mode,
    load_clone_engine_for_sample_dir,
    runtime_matches_active_sample,
    uses_private_engine_cache,
)
from services.runtime_state import AppRuntime
from touch_mode_config import is_corpus_touch_mode, resolve_corpus_path
from voice_forge_paths import (
    ALT_ENGINE_PREWARM_TARGET,
    alt_engine_corpus_snapshot_path,
    alt_engine_touch_cache_dir,
    corpus_snapshot_path,
    get_active_sample_info,
    read_realtime_inference_enabled,
    resolve_active_sample_dir,
    resolve_corpus_path_for_sample,
    resolve_sample_dir,
    touch_cache_dir_for_sample,
    write_touch_cache_pointer,
)


def is_prewarm_active(runtime: AppRuntime) -> bool:
    return (
        runtime.touch_mode_sync_running
        or (runtime.offline_prewarm_manager is not None and runtime.offline_prewarm_manager._building)
        or (runtime.cache_manager is not None and runtime.cache_manager._building)
    )


def custom_corpus_runtime_ready(runtime: AppRuntime) -> bool:
    return (
        runtime.engine is not None
        and runtime_matches_active_sample(runtime)
        and runtime.cache_manager is not None
        and runtime.cache_manager.is_cache_valid()
    )


def _resolve_private_engine_corpus_path(runtime: AppRuntime) -> Path:
    snapshot = alt_engine_corpus_snapshot_path(runtime.backend_name)
    if snapshot.is_file():
        return snapshot
    sample_dir = resolve_active_sample_dir()
    if sample_dir is not None:
        sample_snapshot = corpus_snapshot_path(sample_dir)
        if sample_snapshot.is_file():
            return sample_snapshot
    return resolve_corpus_path()


def _private_engine_cache_kwargs(runtime: AppRuntime) -> dict[str, Any]:
    assets = resolve_engine_asset_paths(runtime.backend_name)
    cache_dir = alt_engine_touch_cache_dir(runtime.backend_name)
    cache_dir.mkdir(parents=True, exist_ok=True)
    kwargs: dict[str, Any] = {
        "cache_dir": cache_dir,
        "corpus_path": _resolve_private_engine_corpus_path(runtime),
        "backend": runtime.backend_name,
    }
    if assets.get("config_path") is not None:
        kwargs["config_path"] = assets["config_path"]
    if assets.get("model_path") is not None:
        kwargs["model_path"] = assets["model_path"]
    return kwargs


def _qwen_model_dir_for_cache_probe(runtime: AppRuntime, current_engine: Any | None = None) -> Path | None:
    probe_engine = current_engine if current_engine is not None else runtime.engine
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


def probe_sample_cache_manager(
    runtime: AppRuntime,
    folder_id: str | None = None,
    *,
    current_engine: Any | None = None,
) -> AudioCacheManager | None:
    if runtime.backend_name != "qwen":
        return None
    sample_dir = resolve_active_sample_dir() if not folder_id else None
    if folder_id:
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
        "backend": runtime.backend_name,
    }
    if runtime.backend_name == "qwen":
        kwargs["qwen_config_path"] = QWEN_CONFIG_PATH
        ref_wav = sample_dir / "reference.wav"
        if ref_wav.is_file():
            kwargs["qwen_clone_ref"] = ref_wav
        model_dir = _qwen_model_dir_for_cache_probe(runtime, current_engine)
        if model_dir is not None:
            kwargs["qwen_model_dir"] = model_dir
    return AudioCacheManager(**kwargs)


def probe_alt_engine_cache_manager(runtime: AppRuntime, *, current_engine: Any | None = None) -> AudioCacheManager | None:
    _ = current_engine
    if engine_supports_voice_forge(runtime.backend_name):
        return None
    corpus_path = _resolve_private_engine_corpus_path(runtime)
    if not corpus_path.is_file():
        return None
    return AudioCacheManager(**_private_engine_cache_kwargs(runtime))


def build_cache_manager(runtime: AppRuntime, current_engine) -> AudioCacheManager:
    if uses_private_engine_cache(runtime):
        return AudioCacheManager(**_private_engine_cache_kwargs(runtime))

    if is_alt_engine_corpus_mode(runtime):
        raise RuntimeError("Qwen 引擎请使用音色工坊 custom_corpus，而非 alt_engine_corpus")

    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        raise RuntimeError("未选择激活的克隆声线，无法构建语料缓存")

    cache_dir = touch_cache_dir_for_sample(sample_dir)
    corpus_path = resolve_corpus_path_for_sample(sample_dir)
    cache_kwargs: dict = {
        "cache_dir": cache_dir,
        "corpus_path": corpus_path,
        "backend": runtime.backend_name,
        "qwen_config_path": QWEN_CONFIG_PATH,
        "qwen_model_dir": current_engine.model_dir,
    }
    clone_ref = getattr(current_engine, "clone_reference_path", None)
    if clone_ref is not None:
        cache_kwargs["qwen_clone_ref"] = clone_ref
    return AudioCacheManager(**cache_kwargs)


def resolve_cache_manager_for_active(runtime: AppRuntime) -> AudioCacheManager | None:
    if uses_private_engine_cache(runtime):
        if (
            runtime.cache_manager is not None
            and runtime.cache_manager.cache_dir == alt_engine_touch_cache_dir(runtime.backend_name)
        ):
            return runtime.cache_manager
        return probe_alt_engine_cache_manager(runtime, current_engine=runtime.engine)

    folder_id = active_folder_id(runtime)
    if (
        runtime.cache_manager is not None
        and folder_id
        and folder_id == runtime.cached_sample_id
        and runtime_matches_active_sample(runtime)
    ):
        return runtime.cache_manager
    return probe_sample_cache_manager(runtime, folder_id, current_engine=runtime.engine)


def prewarm_corpus_cache(runtime: AppRuntime, *, blocking: bool | None = None) -> None:
    must_block = blocking if blocking is not None else runtime.corpus_prewarm_must_block

    runtime.refresh_touch_mode_from_disk(reconcile=True)
    if not is_corpus_touch_mode(runtime.touch_mode):
        print("[TTS Cache] 当前非语料模式，跳过预热", flush=True)
        runtime.corpus_prewarm_must_block = False
        return

    current_engine = runtime.engine
    if uses_private_engine_cache(runtime):
        runtime.cache_manager = build_cache_manager(runtime, current_engine)
        runtime.cached_sample_id = None
        print(
            f"[TTS Cache] 预热第三方引擎语料 · engine={runtime.backend_name} · "
            f"缓存目录={alt_engine_touch_cache_dir(runtime.backend_name)}",
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
        runtime.cache_manager = build_cache_manager(runtime, current_engine)
        runtime.cached_sample_id = active_folder_id(runtime)

    manager = runtime.cache_manager
    assert manager is not None
    if manager.is_cache_valid():
        skip_prewarm = True
        if must_block:
            _, work_total = manager.estimate_prewarm_work()
            skip_prewarm = work_total == 0
        if skip_prewarm:
            if uses_private_engine_cache(runtime):
                print("[TTS Cache] 第三方引擎语料缓存已有效，跳过预热", flush=True)
            else:
                sample_dir = resolve_active_sample_dir()
                if sample_dir is not None:
                    write_touch_cache_pointer(
                        sample_dir,
                        source_hash=manager.compute_source_hash(),
                        ready=True,
                        line_count=len(manager.collect_lines()),
                    )
                print("[TTS Cache] 该声线仓库已有有效缓存，跳过预热", flush=True)
            runtime.corpus_prewarm_must_block = False
            return
    if read_realtime_inference_enabled() and not must_block:
        print(
            "[TTS Cache] 实时推理已开启，克隆引擎就绪；语料缓存将在后台预热（不阻塞点击合成）",
            flush=True,
        )
        manager.build_async(current_engine)
        return
    print("[TTS Cache] 检测到语料或声线变更，开始预热...", flush=True)
    manager.build_sync(current_engine)
    runtime.corpus_prewarm_must_block = False


def prewarm_sample_cache_offline(runtime: AppRuntime, folder_id: str) -> None:
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

    runtime.offline_prewarm_folder_id = folder_id
    temp_engine = None
    manager: AudioCacheManager | None = None
    try:
        temp_engine = load_clone_engine_for_sample_dir(sample_dir)
        manager = probe_sample_cache_manager(runtime, folder_id, current_engine=temp_engine)
        if manager is None:
            raise RuntimeError(f"无法构建声线 {folder_id} 的语料缓存管理器")

        runtime.offline_prewarm_manager = manager
        if manager.is_cache_valid():
            write_touch_cache_pointer(
                sample_dir,
                source_hash=manager.compute_source_hash(),
                ready=True,
                line_count=len(manager.collect_lines()),
            )
            print(f"[TTS Cache] 声线 {folder_id} 语料缓存已是最新，跳过预热", flush=True)
            return

        print(f"[TTS Cache] 离线增量预热声线 {folder_id}（不影响当前激活声线）…", flush=True)
        manager.build_sync(temp_engine)
        print(f"[TTS Cache] 声线 {folder_id} 离线语料预热完成", flush=True)
    finally:
        runtime.offline_prewarm_manager = None
        if temp_engine is not None:
            model = getattr(temp_engine, "_model", None)
            del temp_engine
            try:
                from qwen_clone_setup import _unload_model
                _unload_model(model)
            except Exception:  # noqa: BLE001
                pass
