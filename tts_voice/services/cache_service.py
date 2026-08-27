"""GET /cache/*、POST /tts 业务逻辑（P2d）；状态经 AppRuntime 门面。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app_config.voice_config import TtsBatchRequest, TtsRequest
from services.batch_inference import dispatch_synthesize, dispatch_synthesize_batch, dispatch_synthesize_chat
from services.companion_cpu_engine import synthesize_companion_tts
from services.runtime_state import AppRuntime
from touch_mode_config import is_corpus_touch_mode
from voice_forge_paths import read_touch_cache_pointer, resolve_active_sample_dir


@dataclass
class CacheAudioResult:
    wav_bytes: bytes | None = None
    error_status: int | None = None
    error_detail: str | None = None


def _apply_sync_prewarm_status(status: dict[str, Any], probe: Any | None) -> dict[str, Any]:
    # P3: probe._progress_* 私有字段访问，legacy 遗留
    if probe is None:
        return status
    work_lines, work_total = probe.estimate_prewarm_work()
    done = probe._progress_done if probe._building else 0
    total = probe._progress_total if probe._progress_total > 0 else work_total
    status.update(
        ready=False,
        building=True,
        prewarm_work_lines=len(work_lines),
        prewarm_work_total=work_total,
        progress={"done": done, "total": total},
        message="正在预热语料库喵~",
    )
    return status


def _probe_for_folder(runtime: AppRuntime, folder_id: str | None):
    if runtime.uses_private_engine_cache():
        return runtime.probe_alt_engine_cache_manager()
    return runtime.probe_sample_cache_manager(folder_id)


def _attach_cache_pointer(status: dict[str, Any], runtime: AppRuntime) -> None:
    if runtime.uses_private_engine_cache():
        return
    sample_dir = resolve_active_sample_dir()
    if sample_dir is not None:
        status["cache_pointer"] = read_touch_cache_pointer(sample_dir)


def _status_offline_manager(runtime: AppRuntime, folder_id: str | None) -> dict[str, Any]:
    mgr = runtime.offline_prewarm_manager
    status = mgr.status()
    status["touch_mode"] = runtime.touch_mode
    status["sample_folder_id"] = runtime.offline_prewarm_folder_id or folder_id
    status["cache_dir"] = str(mgr.cache_dir)
    status["prewarm_active"] = runtime.is_prewarm_active()
    status["offline_prewarm"] = True
    status["message"] = "正在离线预热语料库喵~"
    if runtime.touch_mode_sync_running and not mgr._building:
        status = _apply_sync_prewarm_status(status, mgr)
    return status


def _status_corpus_no_manager(runtime: AppRuntime, folder_id: str | None) -> dict[str, Any]:
    if runtime.offline_prewarm_folder_id and runtime.touch_mode_sync_running:
        return _apply_sync_prewarm_status(
            {
                "backend": runtime.backend_name,
                "ready": False,
                "building": True,
                "stale": False,
                "touch_mode": runtime.touch_mode,
                "sample_folder_id": runtime.offline_prewarm_folder_id,
                "prewarm_active": True,
                "offline_prewarm": True,
                "progress": {"done": 0, "total": 0},
                "message": "正在加载克隆引擎以离线预热语料…",
            },
            runtime.probe_sample_cache_manager(runtime.offline_prewarm_folder_id),
        )

    if runtime.cache_manager is not None:
        status = runtime.cache_manager.status()
        status["touch_mode"] = runtime.touch_mode
        status["sample_folder_id"] = folder_id
        status["cache_dir"] = str(runtime.cache_manager.cache_dir)
        _attach_cache_pointer(status, runtime)
        status["prewarm_active"] = runtime.is_prewarm_active()
        if runtime.touch_mode_sync_running and not runtime.cache_manager._building:
            status = _apply_sync_prewarm_status(status, runtime.cache_manager)
        return status

    if not is_corpus_touch_mode(runtime.touch_mode):
        return {
            "backend": runtime.backend_name,
            "ready": False,
            "building": False,
            "stale": True,
            "touch_mode": runtime.touch_mode,
            "prewarm_active": False,
            "progress": {"done": 0, "total": 0},
            "message": "当前为精选音频模式，未启用语料缓存",
        }

    if runtime.touch_mode_sync_running:
        probe = _probe_for_folder(runtime, folder_id)
        total = done = work_lines = 0
        if probe is not None:
            lines, total = probe.estimate_prewarm_work()
            work_lines = len(lines)
        return _apply_sync_prewarm_status(
            {
                "backend": runtime.backend_name,
                "ready": False,
                "building": True,
                "stale": False,
                "touch_mode": runtime.touch_mode,
                "sample_folder_id": folder_id,
                "prewarm_active": True,
                "progress": {"done": done, "total": total},
                "prewarm_work_lines": work_lines,
                "prewarm_work_total": total,
            },
            probe,
        )

    probe = _probe_for_folder(runtime, folder_id)
    if probe is not None and probe.is_cache_valid():
        status = probe.status()
        status["touch_mode"] = runtime.touch_mode
        status["sample_folder_id"] = folder_id
        status["cache_dir"] = str(probe.cache_dir)
        _attach_cache_pointer(status, runtime)
        status["prewarm_active"] = runtime.is_prewarm_active()
        status["message"] = (
            "第三方引擎语料缓存已就绪，等待 TTS 引擎挂载"
            if runtime.uses_private_engine_cache()
            else "该声线仓库已有预热缓存，等待 TTS 引擎挂载"
        )
        return status

    return {
        "backend": runtime.backend_name,
        "ready": False,
        "building": False,
        "stale": True,
        "touch_mode": runtime.touch_mode,
        "sample_folder_id": folder_id,
        "prewarm_active": runtime.is_prewarm_active(),
        "progress": {"done": 0, "total": 0},
        "message": (
            "第三方引擎语料模式，尚未预热"
            if runtime.uses_private_engine_cache()
            else "自定义语料模式，该声线仓库尚未预热"
        ),
    }


def build_cache_status(runtime: AppRuntime) -> dict[str, Any]:
    runtime.refresh_touch_mode_from_disk()
    folder_id = runtime.active_folder_id()
    if runtime.offline_prewarm_manager is not None:
        return _status_offline_manager(runtime, folder_id)
    return _status_corpus_no_manager(runtime, folder_id)

def rebuild_cache(runtime: AppRuntime) -> dict[str, Any]:
    if runtime.engine is None or runtime.cache_manager is None:
        raise RuntimeError("语料缓存未启用（精选音频模式）")
    # TODO: 若 build_async 阻塞请求线程，考虑 FastAPI BackgroundTasks
    runtime.cache_manager.build_async(runtime.engine)
    return runtime.cache_manager.status()

def fetch_cache_audio(runtime: AppRuntime, text: str, variant: int | None) -> CacheAudioResult:
    runtime.refresh_touch_mode_from_disk()
    if not is_corpus_touch_mode(runtime.touch_mode):
        return CacheAudioResult(error_status=503, error_detail="语料缓存未启用")
    manager = runtime.resolve_cache_manager_for_active()
    if manager is None:
        return CacheAudioResult(error_status=503, error_detail="语料缓存未启用")
    path = manager.resolve_wav_path(text, variant, allow_partial=True)
    if path is not None:
        return CacheAudioResult(wav_bytes=path.read_bytes())
    if runtime.is_prewarm_active():
        return CacheAudioResult(error_status=503, error_detail="语料缓存正在加载，请稍候")
    if runtime.engine is None or not runtime.runtime_matches_active_sample():
        return CacheAudioResult(error_status=503, error_detail="克隆声线正在切换，请稍候")
    return CacheAudioResult(error_status=404, error_detail="该句暂无缓存，可能仍在生成中")


def synthesize_tts(runtime: AppRuntime, request: TtsRequest) -> bytes:
    if runtime.engine is None:
        raise RuntimeError("TTS 引擎尚未就绪")
    tm = runtime.touch_mode
    if is_corpus_touch_mode(tm) and not runtime.uses_private_engine_cache() and not runtime.runtime_matches_active_sample():
        raise RuntimeError("克隆声线正在切换，请稍候")
    if request.mode == "companion":
        return synthesize_companion_tts(
            runtime,
            request.text,
            speaker_id=request.speaker_id,
            seed=request.seed,
            order=request.order,
        )
    if request.mode == "chat":
        lanes = int(request.parallel_lanes or 0)
        return dispatch_synthesize_chat(
            runtime.engine,
            request.text,
            speaker_id=request.speaker_id,
            seed=request.seed,
            order=request.order,
            parallel_lanes=lanes,
        )
    return dispatch_synthesize(
        runtime.engine,
        request.text,
        speaker_id=request.speaker_id,
        seed=request.seed,
    )


def synthesize_tts_batch(runtime: AppRuntime, request: TtsBatchRequest) -> list[bytes]:
    if runtime.engine is None:
        raise RuntimeError("TTS 引擎尚未就绪")
    tm = runtime.touch_mode
    if is_corpus_touch_mode(tm) and not runtime.uses_private_engine_cache() and not runtime.runtime_matches_active_sample():
        raise RuntimeError("克隆声线正在切换，请稍候")
    return dispatch_synthesize_batch(
        runtime.engine,
        request.texts,
        speaker_id=request.speaker_id,
        seed=request.seed,
    )