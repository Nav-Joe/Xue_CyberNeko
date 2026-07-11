from __future__ import annotations

import voice_forge_paths
from services.runtime_state import AppRuntime, RuntimeStore
from services.sync_service import sync_touch_mode_entry


def _prep_custom_corpus(disk) -> AppRuntime:
    disk.write_touch_mode("custom_corpus")
    disk.write_reference(disk.default_sample)
    disk.write_voice_forge({
        "activeSample": {"folderId": voice_forge_paths.OFFICIAL_SAMPLE_ID, "kind": "official"},
    })
    return AppRuntime(RuntimeStore(touch_mode="custom_corpus", ready=True))


def test_prewarm_flag_consumed_then_sync_queued(disk, monkeypatch):
    monkeypatch.setattr("services.sync_service.reconcile_runtime_voice_config", lambda: "custom_corpus")
    queued: list[dict] = []
    monkeypatch.setattr("services.sync_service._start_sync_thread", lambda _r, payload: queued.append(payload))
    disk.write_prewarm_flag("default_sample")
    runtime = _prep_custom_corpus(disk)

    resp = sync_touch_mode_entry(runtime)

    assert resp.prewarm is True and resp.changed is True
    assert len(queued) == 1
    assert not voice_forge_paths.CORPUS_PREWARM_FLAG.exists()


def test_sync_lock_busy_rewrites_prewarm_flag(disk, monkeypatch):
    monkeypatch.setattr("services.sync_service.reconcile_runtime_voice_config", lambda: "custom_corpus")
    disk.write_prewarm_flag("default_sample")
    runtime = _prep_custom_corpus(disk)
    runtime.touch_mode_sync_lock.acquire()

    resp = sync_touch_mode_entry(runtime)

    assert resp.prewarm is True
    assert voice_forge_paths.CORPUS_PREWARM_FLAG.read_text(encoding="utf-8").strip() == "default_sample"
    runtime.touch_mode_sync_lock.release()
