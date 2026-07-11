"""POST /touch-mode/sync：前置校验 + 后台 sync/prewarm 线程（P2b-ii-b）。"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Literal

from app_config.voice_config import ALT_ENGINE_PREWARM_TARGET, TouchModeSyncResponse
from services.runtime_state import AppRuntime
from touch_mode_config import is_corpus_touch_mode
from voice_forge_paths import (
    consume_corpus_prewarm_flag,
    get_active_sample_info,
    write_corpus_prewarm_flag,
)
from voice_runtime_repair import reconcile_runtime_voice_config


@dataclass
class SyncContext:
    new_mode: str
    active_id: str | None
    corpus_target_id: str | None
    corpus_prewarm_requested: bool
    offline_prewarm: bool = False


@dataclass
class SyncThreadPayload:
    kind: Literal["offline_prewarm", "corpus_sync"]
    sync_generation: int
    corpus_target_id: str | None = None
    active_id: str | None = None
    had_corpus_prewarm: bool = False

    def to_legacy_dict(self) -> dict[str, Any]:
        """与 _start_sync_thread(payload) 字段契约；增删字段须双端同改。"""
        return {
            "kind": self.kind,
            "sync_generation": self.sync_generation,
            "corpus_target_id": self.corpus_target_id,
            "active_id": self.active_id,
            "had_corpus_prewarm": self.had_corpus_prewarm,
        }


def _resp(*, touch_mode: str, prewarm: bool, changed: bool) -> TouchModeSyncResponse:
    return TouchModeSyncResponse(ok=True, touch_mode=touch_mode, prewarm=prewarm, changed=changed)


def _parse_context(runtime: AppRuntime, payload: dict[str, Any] | None) -> SyncContext:
    _ = payload
    return SyncContext(
        new_mode=reconcile_runtime_voice_config(),
        active_id=runtime.active_folder_id(),
        corpus_target_id=consume_corpus_prewarm_flag(),
        corpus_prewarm_requested=False,
    )


def _apply_corpus_prewarm(runtime: AppRuntime, ctx: SyncContext) -> None:
    ctx.corpus_prewarm_requested = ctx.corpus_target_id is not None
    if not ctx.corpus_prewarm_requested:
        return
    runtime.corpus_prewarm_must_block = True
    ctx.active_id = runtime.active_folder_id() or None
    if ctx.corpus_target_id == ALT_ENGINE_PREWARM_TARGET or runtime.uses_private_engine_cache():
        ctx.offline_prewarm = False
        runtime.cache_manager = None
        if not (runtime.engine is not None and runtime.uses_private_engine_cache()):
            runtime.invalidate_voice_runtime("检测到语料预热请求")
    elif ctx.active_id and ctx.corpus_target_id != ctx.active_id:
        ctx.offline_prewarm = True
    else:
        runtime.cache_manager = None
        keep = runtime.engine is not None and (
            runtime.uses_private_engine_cache()
            or (ctx.new_mode == "custom_corpus" and runtime.runtime_matches_active_sample())
        )
        if keep:
            print("[TTS] 语料变更：保留已加载引擎，仅增量预热变更句子", flush=True)
        else:
            runtime.invalidate_voice_runtime("检测到语料预热请求")


def _maybe_invalidate_sample(runtime: AppRuntime, ctx: SyncContext) -> None:
    if ctx.new_mode != "custom_corpus":
        return
    if ctx.active_id and runtime.cached_sample_id and ctx.active_id != runtime.cached_sample_id:
        runtime.invalidate_voice_runtime(f"激活声线切换为 {ctx.active_id}")
    elif runtime.engine is not None and not runtime.runtime_matches_active_sample():
        runtime.invalidate_voice_runtime("激活声线与已加载克隆不一致")


def _try_early(runtime: AppRuntime, ctx: SyncContext) -> TouchModeSyncResponse | None:
    mode = runtime.touch_mode
    if ctx.new_mode != mode or ctx.corpus_prewarm_requested:
        return None
    if mode == "curated":
        return _resp(touch_mode=mode, prewarm=False, changed=False)
    if runtime.custom_corpus_runtime_ready():
        return _resp(touch_mode=mode, prewarm=runtime.is_prewarm_active(), changed=False)
    if runtime.touch_mode_sync_running:
        return _resp(touch_mode=mode, prewarm=True, changed=False)
    if runtime.engine is not None and runtime.runtime_matches_active_sample() and runtime.is_prewarm_active():
        return _resp(touch_mode=mode, prewarm=True, changed=False)
    return None


def _lock_busy(runtime: AppRuntime, ctx: SyncContext, *, changed: bool) -> TouchModeSyncResponse | None:
    if runtime.touch_mode_sync_lock.acquire(blocking=False):
        return None
    if ctx.corpus_target_id:
        write_corpus_prewarm_flag(ctx.corpus_target_id)
    print("[TTS] 语料同步已在运行，跳过重复请求", flush=True)
    return _resp(touch_mode=runtime.touch_mode, prewarm=True, changed=changed)


def _will_prewarm(runtime: AppRuntime, ctx: SyncContext) -> bool:
    if ctx.corpus_prewarm_requested:
        return True
    if runtime.uses_private_engine_cache():
        probe = runtime.probe_alt_engine_cache_manager()
    else:
        probe = runtime.probe_sample_cache_manager(ctx.active_id) if ctx.active_id else None
    return not (probe is not None and probe.is_cache_valid())


def _finish_corpus_sync(runtime: AppRuntime, payload: dict[str, Any]) -> None:
    if payload.get("had_corpus_prewarm"):
        runtime.corpus_prewarm_must_block = False
    # legacy 顺序：先 sync_running=False 再 release，避免 /health 见 running 已 false 时锁仍占用
    runtime.touch_mode_sync_running = False
    runtime.touch_mode_sync_lock.release()


def _offline_prewarm_runner(runtime: AppRuntime, payload: dict[str, Any]) -> None:
    sync_generation = payload["sync_generation"]
    corpus_target_id = payload.get("corpus_target_id")
    active_id = payload.get("active_id")
    runtime.touch_mode_sync_running = True
    runtime.offline_prewarm_folder_id = corpus_target_id
    try:
        if runtime.touch_mode_sync_stale(sync_generation):
            print("[TTS Cache] 离线语料预热已取消（模式已切换）", flush=True)
            return
        print(
            f"[TTS Cache] 离线预热目标={corpus_target_id} · "
            f"保持当前激活声线={active_id} · touch_mode={runtime.touch_mode}",
            flush=True,
        )
        runtime.prewarm_sample_cache_offline(corpus_target_id or "")
    except Exception as error:  # noqa: BLE001
        print(f"[TTS Cache] 离线语料预热失败: {error}", flush=True)
    finally:
        runtime.touch_mode_sync_running = False
        runtime.corpus_prewarm_must_block = False
        runtime.offline_prewarm_folder_id = None
        runtime.touch_mode_sync_lock.release()


def _sync_alt_engine_runner(runtime: AppRuntime, payload: dict[str, Any]) -> None:
    sync_generation = payload["sync_generation"]
    runtime.touch_mode_sync_running = True
    try:
        if runtime.touch_mode_sync_stale(sync_generation):
            print("[TTS] 第三方语料同步已取消（模式已切换）", flush=True)
            return
        if runtime.engine is None:
            print(
                f"[TTS] 检测到第三方引擎语料模式，正在加载 {runtime.backend_name} …",
                flush=True,
            )
            runtime.mount_default_engine()
        else:
            print("[TTS] 第三方引擎已就绪，开始增量预热语料 …", flush=True)
        runtime.refresh_touch_mode_from_disk(reconcile=True)
        if runtime.touch_mode_sync_stale(sync_generation) or not runtime.uses_private_engine_cache():
            print("[TTS] 第三方语料同步已取消（模式已切换）", flush=True)
            return
        runtime.prewarm_corpus_cache()
        # TODO: 线程异常时是否应将 ready=False（legacy 同样在 except 路径不设 ready）
        runtime.ready = True
        print("[TTS] 第三方引擎语料预热完成", flush=True)
    except Exception as error:  # noqa: BLE001
        print(f"[TTS] 第三方引擎语料同步失败: {error}", flush=True)
    finally:
        _finish_corpus_sync(runtime, payload)


def _sync_clone_runner(runtime: AppRuntime, payload: dict[str, Any]) -> None:
    sync_generation = payload["sync_generation"]
    runtime.touch_mode_sync_running = True
    try:
        if runtime.touch_mode_sync_stale(sync_generation):
            print("[TTS] 语料同步已取消（模式已切换）", flush=True)
            return
        active = get_active_sample_info()
        if runtime.engine is None or not runtime.runtime_matches_active_sample():
            print(
                f"[TTS] 检测到自定义语料模式，正在加载克隆声线… "
                f"active={active} folderId={runtime.active_folder_id()}",
                flush=True,
            )
            runtime.require_clone_reference_files()
            runtime.engine = runtime.load_clone_engine()
            ref = getattr(runtime.engine, "clone_reference_path", None)
            print(
                f"[TTS] 克隆引擎已挂载 · 参考音={ref} · "
                f"匹配激活目录={runtime.runtime_matches_active_sample()}",
                flush=True,
            )
        else:
            print(
                f"[TTS] 克隆引擎已就绪，开始增量预热语料 … "
                f"active={active} folderId={runtime.active_folder_id()}",
                flush=True,
            )
        runtime.refresh_touch_mode_from_disk(reconcile=True)
        if runtime.touch_mode_sync_stale(sync_generation) or not is_corpus_touch_mode(runtime.touch_mode):
            print("[TTS] 语料同步已取消（模式已切换）", flush=True)
            return
        runtime.prewarm_corpus_cache()
        # TODO: 线程异常时是否应将 ready=False（legacy 同样在 except 路径不设 ready）
        runtime.ready = True
        print("[TTS] 克隆声线切换完成", flush=True)
    except Exception as error:  # noqa: BLE001
        print(f"[TTS] 克隆声线切换失败: {error}", flush=True)
    finally:
        _finish_corpus_sync(runtime, payload)


def _start_sync_thread(runtime: AppRuntime, payload: dict[str, Any]) -> None:
    if payload["kind"] == "offline_prewarm":
        threading.Thread(
            target=_offline_prewarm_runner,
            args=(runtime, payload),
            name="touch-mode-offline-prewarm",
            daemon=True,
        ).start()
        return
    runner = _sync_alt_engine_runner if runtime.uses_private_engine_cache() else _sync_clone_runner
    threading.Thread(
        target=runner,
        args=(runtime, payload),
        name="touch-mode-sync",
        daemon=True,
    ).start()


def sync_touch_mode_entry(
    runtime: AppRuntime,
    payload: dict[str, Any] | None = None,
) -> TouchModeSyncResponse:
    ctx = _parse_context(runtime, payload)
    _apply_corpus_prewarm(runtime, ctx)

    if ctx.offline_prewarm:
        blocked = _lock_busy(runtime, ctx, changed=False)
        if blocked:
            return blocked
        gen = runtime.bump_touch_mode_sync_generation()
        _start_sync_thread(
            runtime,
            SyncThreadPayload(
                kind="offline_prewarm",
                sync_generation=gen,
                corpus_target_id=ctx.corpus_target_id,
                active_id=ctx.active_id,
            ).to_legacy_dict(),
        )
        return _resp(touch_mode=runtime.touch_mode, prewarm=True, changed=False)

    _maybe_invalidate_sample(runtime, ctx)
    early = _try_early(runtime, ctx)
    if early:
        return early

    runtime.touch_mode = ctx.new_mode
    if runtime.touch_mode == "curated":
        runtime.bump_touch_mode_sync_generation()
        runtime.invalidate_voice_runtime()
        runtime.voice_forge_review_pending = False
        runtime.ready = True
        print("[TTS] 已同步为精选音频模式", flush=True)
        return _resp(touch_mode=runtime.touch_mode, prewarm=False, changed=True)

    prewarm = _will_prewarm(runtime, ctx)
    blocked = _lock_busy(runtime, ctx, changed=True)
    if blocked:
        return blocked
    gen = runtime.bump_touch_mode_sync_generation()
    _start_sync_thread(
        runtime,
        SyncThreadPayload(
            kind="corpus_sync",
            sync_generation=gen,
            had_corpus_prewarm=ctx.corpus_prewarm_requested,
        ).to_legacy_dict(),
    )
    # TODO: 线程异常时是否应将 ready=False（legacy 在线程启动后立即 ready=True）
    runtime.ready = True
    return _resp(touch_mode=runtime.touch_mode, prewarm=prewarm, changed=True)
