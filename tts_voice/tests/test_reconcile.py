from __future__ import annotations

import json

import voice_forge_paths
from voice_forge_session import read_session
from voice_runtime_repair import reconcile_runtime_voice_config


def test_alt_engine_corpus_with_qwen_falls_back_to_curated(disk, mock_engine_name):
    mock_engine_name("qwen")
    disk.write_touch_mode("alt_engine_corpus")
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_invalid_custom_corpus_falls_back_to_curated_and_clears_stuck_session(disk, mock_engine_name):
    mock_engine_name("style-bert-vits2")
    disk.write_touch_mode("custom_corpus")
    disk.write_voice_forge({"activeSample": {"folderId": "orphan_sample", "kind": "custom"}})
    disk.runtime.mkdir(parents=True, exist_ok=True)
    (disk.runtime / "voice-forge-session.json").write_text(
        json.dumps({"flow": "create_voice", "phase": "prewarming"}) + "\n", encoding="utf-8"
    )
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"
    assert read_session() is None


def test_curated_official_active_sample_ready_upgrades_to_custom_corpus(disk, mock_engine_name):
    mock_engine_name("qwen")
    disk.write_touch_mode("curated")
    disk.write_reference(disk.default_sample)
    disk.write_voice_forge({
        "activeSample": {"folderId": voice_forge_paths.OFFICIAL_SAMPLE_ID, "kind": "official"},
        "officialUseCuratedClips": False,
    })
    assert reconcile_runtime_voice_config() == "custom_corpus"
    assert disk.read_touch_mode() == "custom_corpus"
