"""进程内 TTS 运行时状态（P4：自管 store，不再依赖 legacy 模块）。"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any

from audio_cache import AudioCacheManager

_RUNTIME: AppRuntime | None = None


@dataclass
class RuntimeStore:
    backend_name: str = "unknown"
    touch_mode: str = "curated"
    engine: Any = None
    ready: bool = False
    cache_manager: AudioCacheManager | None = None
    voice_forge_review_pending: bool = False
    create_voice_lock: threading.Lock = field(default_factory=threading.Lock)
    touch_mode_sync_lock: threading.Lock = field(default_factory=threading.Lock)
    touch_mode_sync_running: bool = False
    touch_mode_sync_generation: int = 0
    cached_sample_id: str | None = None
    corpus_prewarm_must_block: bool = False
    offline_prewarm_manager: AudioCacheManager | None = None
    offline_prewarm_folder_id: str | None = None
    companion_cpu_engine: Any = None
    companion_cpu_engine_identity: str | None = None


def init_runtime() -> AppRuntime:
    global _RUNTIME
    _RUNTIME = AppRuntime(RuntimeStore())
    return _RUNTIME


def get_runtime() -> AppRuntime:
    if _RUNTIME is None:
        raise RuntimeError("AppRuntime 未初始化：请在 main.create_app() 中调用 init_runtime()")
    return _RUNTIME


class AppRuntime:
    """TTS 进程运行时门面；状态在 RuntimeStore，逻辑在 lifecycle 模块。"""

    __slots__ = ("_store",)

    def __init__(self, store: RuntimeStore) -> None:
        self._store = store

    @property
    def backend_name(self) -> str:
        return self._store.backend_name

    @backend_name.setter
    def backend_name(self, value: str) -> None:
        self._store.backend_name = value

    @property
    def touch_mode(self) -> str:
        return self._store.touch_mode

    @touch_mode.setter
    def touch_mode(self, value: str) -> None:
        self._store.touch_mode = value

    @property
    def engine(self) -> Any:
        return self._store.engine

    @engine.setter
    def engine(self, value: Any) -> None:
        self._store.engine = value

    @property
    def ready(self) -> bool:
        return self._store.ready

    @ready.setter
    def ready(self, value: bool) -> None:
        self._store.ready = value

    @property
    def cache_manager(self) -> AudioCacheManager | None:
        return self._store.cache_manager

    @cache_manager.setter
    def cache_manager(self, value: AudioCacheManager | None) -> None:
        self._store.cache_manager = value

    @property
    def voice_forge_review_pending(self) -> bool:
        return self._store.voice_forge_review_pending

    @voice_forge_review_pending.setter
    def voice_forge_review_pending(self, value: bool) -> None:
        self._store.voice_forge_review_pending = value

    @property
    def create_voice_lock(self) -> threading.Lock:
        return self._store.create_voice_lock

    @property
    def touch_mode_sync_lock(self) -> threading.Lock:
        return self._store.touch_mode_sync_lock

    @property
    def touch_mode_sync_running(self) -> bool:
        return self._store.touch_mode_sync_running

    @touch_mode_sync_running.setter
    def touch_mode_sync_running(self, value: bool) -> None:
        self._store.touch_mode_sync_running = value

    @property
    def touch_mode_sync_generation(self) -> int:
        return self._store.touch_mode_sync_generation

    @touch_mode_sync_generation.setter
    def touch_mode_sync_generation(self, value: int) -> None:
        self._store.touch_mode_sync_generation = value

    @property
    def cached_sample_id(self) -> str | None:
        return self._store.cached_sample_id

    @cached_sample_id.setter
    def cached_sample_id(self, value: str | None) -> None:
        self._store.cached_sample_id = value

    @property
    def corpus_prewarm_must_block(self) -> bool:
        return self._store.corpus_prewarm_must_block

    @corpus_prewarm_must_block.setter
    def corpus_prewarm_must_block(self, value: bool) -> None:
        self._store.corpus_prewarm_must_block = value

    @property
    def offline_prewarm_manager(self) -> AudioCacheManager | None:
        return self._store.offline_prewarm_manager

    @offline_prewarm_manager.setter
    def offline_prewarm_manager(self, value: AudioCacheManager | None) -> None:
        self._store.offline_prewarm_manager = value

    @property
    def offline_prewarm_folder_id(self) -> str | None:
        return self._store.offline_prewarm_folder_id

    @offline_prewarm_folder_id.setter
    def offline_prewarm_folder_id(self, value: str | None) -> None:
        self._store.offline_prewarm_folder_id = value

    @property
    def companion_cpu_engine(self) -> Any:
        return self._store.companion_cpu_engine

    @companion_cpu_engine.setter
    def companion_cpu_engine(self, value: Any) -> None:
        self._store.companion_cpu_engine = value

    @property
    def companion_cpu_engine_identity(self) -> str | None:
        return self._store.companion_cpu_engine_identity

    @companion_cpu_engine_identity.setter
    def companion_cpu_engine_identity(self, value: str | None) -> None:
        self._store.companion_cpu_engine_identity = value

    def refresh_touch_mode_from_disk(self, *, reconcile: bool = False) -> str:
        from services.engine_lifecycle import refresh_touch_mode_from_disk

        return refresh_touch_mode_from_disk(self, reconcile=reconcile)

    def is_prewarm_active(self) -> bool:
        from services.cache_lifecycle import is_prewarm_active

        return is_prewarm_active(self)

    def runtime_matches_active_sample(self) -> bool:
        from services.engine_lifecycle import runtime_matches_active_sample

        return runtime_matches_active_sample(self)

    def active_folder_id(self) -> str | None:
        from services.engine_lifecycle import active_folder_id

        return active_folder_id(self)

    def bump_touch_mode_sync_generation(self) -> int:
        from services.engine_lifecycle import bump_touch_mode_sync_generation

        return bump_touch_mode_sync_generation(self)

    def touch_mode_sync_stale(self, generation: int) -> bool:
        from services.engine_lifecycle import touch_mode_sync_stale

        return touch_mode_sync_stale(self, generation)

    def invalidate_voice_runtime(self, reason: str = "") -> None:
        from services.engine_lifecycle import invalidate_voice_runtime

        invalidate_voice_runtime(self, reason)

    def uses_private_engine_cache(self) -> bool:
        from services.engine_lifecycle import uses_private_engine_cache

        return uses_private_engine_cache(self)

    def custom_corpus_runtime_ready(self) -> bool:
        from services.cache_lifecycle import custom_corpus_runtime_ready

        return custom_corpus_runtime_ready(self)

    def probe_sample_cache_manager(self, folder_id: str | None):
        from services.cache_lifecycle import probe_sample_cache_manager

        return probe_sample_cache_manager(self, folder_id)

    def probe_alt_engine_cache_manager(self):
        from services.cache_lifecycle import probe_alt_engine_cache_manager

        return probe_alt_engine_cache_manager(self)

    def load_clone_engine(self, *, force_regenerate: bool = False):
        from services.engine_lifecycle import load_clone_engine

        return load_clone_engine(self, force_regenerate=force_regenerate)

    def mount_default_engine(self) -> None:
        from services.engine_lifecycle import mount_default_engine

        mount_default_engine(self)

    def prewarm_corpus_cache(self) -> None:
        from services.cache_lifecycle import prewarm_corpus_cache

        prewarm_corpus_cache(self)

    def prewarm_sample_cache_offline(self, folder_id: str) -> None:
        from services.cache_lifecycle import prewarm_sample_cache_offline

        prewarm_sample_cache_offline(self, folder_id)

    def require_clone_reference_files(self) -> None:
        from qwen_clone_setup import require_clone_reference_files

        require_clone_reference_files()

    def resolve_cache_manager_for_active(self):
        from services.cache_lifecycle import resolve_cache_manager_for_active

        return resolve_cache_manager_for_active(self)

    def read_voice_forge_session(self):
        from voice_forge_session import read_session

        return read_session()

    def update_voice_forge_session(self, **fields):
        from voice_forge_session import update_session

        return update_session(**fields)

    def clear_voice_forge_session(self) -> None:
        from voice_forge_session import clear_session

        clear_session()

    def schedule_create_voice_reference_generation(self) -> bool:
        from services.engine_lifecycle import schedule_create_voice_reference_generation

        return schedule_create_voice_reference_generation(self)
