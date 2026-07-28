"""Python reconcile 行为锁 + CONTRACT 不对称对照。

修改本文件或 voice_runtime_repair.py 前请同步阅读：
  electron/main/config/CONTRACT.md §已知不对称（A1–A7）

只锁「当前 Python 行为」与契约标注；
不试图让 Python 对齐 Electron 的破坏性清理 / cache 门槛。
"""

from __future__ import annotations

import json

import voice_forge_paths
from voice_forge_session import read_session
from voice_runtime_repair import reconcile_runtime_voice_config


def test_alt_engine_corpus_with_qwen_falls_back_to_curated(disk, mock_engine_name):
    # CONTRACT：规则 #3 两端一致（非不对称项）
    mock_engine_name("qwen")
    disk.write_touch_mode("alt_engine_corpus")
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_alt_engine_missing_corpus_falls_back_to_curated(disk, mock_engine_name, monkeypatch):
    # CONTRACT A1 **已统一（跟 Python）**：alt_engine 且 corpus.custom.json 缺失 → curated。
    # Electron reconcile #4 同步检查该文件并回退（见 electron/main/config/reconcile.ts）。
    # 须 patch repair 模块内已绑定的 read_engine_name（仅改 tts_config 不够）。
    monkeypatch.setattr("voice_runtime_repair.read_engine_name", lambda: "bert_vits2")
    mock_engine_name("bert_vits2")
    disk.write_touch_mode("alt_engine_corpus")
    from touch_mode_config import CUSTOM_CORPUS_PATH

    assert not CUSTOM_CORPUS_PATH.is_file()
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_invalid_custom_corpus_falls_back_to_curated_and_clears_stuck_session(disk, mock_engine_name):
    # CONTRACT A2（永久分工③）：Python 无效 custom → curated + 可清 session；
    # 破坏性删盘 / 重置 forge 只在 Electron（本测不声称 Python 会删盘）。
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


def test_invalid_custom_does_not_delete_orphan_dir_or_reset_forge(disk, mock_engine_name, monkeypatch):
    # CONTRACT A2 **永久产品分工**：Electron #5 可 rmSync orphan + 重置 official；
    # Python 仅改 touch-mode，保留样本目录与 voice-forge.json activeSample（禁止 TTS 误删用户样本）。
    monkeypatch.setattr("voice_runtime_repair.read_engine_name", lambda: "bert_vits2")
    mock_engine_name("bert_vits2")
    orphan = voice_forge_paths.CUSTOM_SAMPLE_DIR / "orphan_sample"
    orphan.mkdir(parents=True, exist_ok=True)
    (orphan / "placeholder.txt").write_text("keep", encoding="utf-8")
    disk.write_touch_mode("custom_corpus")
    forge_payload = {
        "activeSample": {"folderId": "orphan_sample", "kind": "custom", "displayName": "孤儿"},
        "officialUseCuratedClips": False,
    }
    disk.write_voice_forge(forge_payload)

    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"
    assert orphan.is_dir(), "Python 不得删除 orphan 样本目录（对比 Electron rmSync）"
    saved = json.loads(voice_forge_paths.VOICE_FORGE_CONFIG_FILE.read_text(encoding="utf-8"))
    assert saved.get("activeSample", {}).get("folderId") == "orphan_sample"


def test_custom_corpus_wav_only_is_invalid_for_python(disk, mock_engine_name):
    # CONTRACT A5 **已统一（①）**：两端 reconcile #5 均要求 wav+txt；仅 wav → curated。
    # Electron：sampleReadyForTts；列表仍可用 sampleHasReference（仅 wav）。
    mock_engine_name("qwen")
    sample_dir = voice_forge_paths.CUSTOM_SAMPLE_DIR / "wav_only"
    sample_dir.mkdir(parents=True, exist_ok=True)
    (sample_dir / voice_forge_paths.REF_WAV_NAME).write_bytes(b"x")
    # 故意不写 reference.txt
    disk.write_touch_mode("custom_corpus")
    disk.write_voice_forge({"activeSample": {"folderId": "wav_only", "kind": "custom"}})

    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_curated_without_touch_cache_does_not_upgrade(disk, mock_engine_name):
    # CONTRACT A6 **已统一（① 跟 Electron）**：#7 须预热缓存就绪才升 custom_corpus。
    # 有 reference、无 touch_cache → 两端均保持 curated。
    mock_engine_name("qwen")
    disk.write_touch_mode("curated")
    disk.write_reference(disk.default_sample)
    disk.write_voice_forge(
        {
            "activeSample": {"folderId": voice_forge_paths.OFFICIAL_SAMPLE_ID, "kind": "official"},
            "officialUseCuratedClips": False,
        }
    )
    cache_dir = disk.default_sample / voice_forge_paths.TOUCH_CACHE_DIR_NAME
    assert not cache_dir.exists()
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_curated_with_touch_cache_ready_upgrades_to_custom_corpus(disk, mock_engine_name):
    # CONTRACT A6：pointer ready 或 manifest+0.wav 齐备时可升 custom_corpus
    mock_engine_name("qwen")
    disk.write_touch_mode("curated")
    disk.write_reference(disk.default_sample)
    disk.write_voice_forge(
        {
            "activeSample": {"folderId": voice_forge_paths.OFFICIAL_SAMPLE_ID, "kind": "official"},
            "officialUseCuratedClips": False,
        }
    )
    cache_dir = disk.default_sample / voice_forge_paths.TOUCH_CACHE_DIR_NAME
    cache_dir.mkdir(parents=True, exist_ok=True)
    (disk.default_sample / voice_forge_paths.TOUCH_CACHE_POINTER_NAME).write_text(
        json.dumps({"ready": True}) + "\n", encoding="utf-8"
    )
    assert reconcile_runtime_voice_config() == "custom_corpus"
    assert disk.read_touch_mode() == "custom_corpus"


def test_cancelled_session_is_ignored_by_python(disk, mock_engine_name):
    # CONTRACT A3 **永久产品分工**：Electron #1 对 phase=cancelled 调 cancelVoiceForgeReview；
    # Python 不执行产品级「取消工坊」，会话可残留、mode 不变。
    mock_engine_name("qwen")
    disk.write_touch_mode("curated")
    disk.write_voice_forge(
        {
            "activeSample": {"folderId": voice_forge_paths.OFFICIAL_SAMPLE_ID, "kind": "official"},
            "officialUseCuratedClips": True,
        }
    )
    (disk.runtime / "voice-forge-session.json").write_text(
        json.dumps({"flow": "create_voice", "phase": "cancelled"}) + "\n", encoding="utf-8"
    )
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"
    session = read_session()
    assert session is not None
    assert session.get("phase") == "cancelled"


def test_alt_engine_keep_still_clears_prewarming_session(disk, mock_engine_name, monkeypatch):
    # CONTRACT A4 **已统一（跟 Python①）**：保持 alt 时两端都会清 prewarming session。
    # Electron：reconcile.ts 保持 alt 分支调用 shouldClearStuckSessionElectron。
    monkeypatch.setattr("voice_runtime_repair.read_engine_name", lambda: "bert_vits2")
    mock_engine_name("bert_vits2")
    from touch_mode_config import CUSTOM_CORPUS_PATH

    CUSTOM_CORPUS_PATH.write_text(
        json.dumps({"head": [], "arms": [], "body": ["hi"], "legs": [], "tail": []}) + "\n",
        encoding="utf-8",
    )
    disk.write_touch_mode("alt_engine_corpus")
    (disk.runtime / "voice-forge-session.json").write_text(
        json.dumps({"flow": "create_voice", "phase": "prewarming"}) + "\n", encoding="utf-8"
    )
    assert reconcile_runtime_voice_config() == "alt_engine_corpus"
    assert disk.read_touch_mode() == "alt_engine_corpus"
    assert read_session() is None


def test_a7_unified_stuck_session_matrix(monkeypatch):
    # CONTRACT A7：与 Electron shouldClearStuckSession 同一张表
    from voice_runtime_repair import _should_clear_stuck_session

    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: True)
    assert (
        _should_clear_stuck_session({"flow": "create_voice", "phase": "pending_restart"}) is False
    )
    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: False)
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "pending_restart"}) is True

    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: True)
    assert (
        _should_clear_stuck_session({"flow": "create_voice", "phase": "awaiting_review"}) is False
    )
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "prewarming"}) is True
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "cancelled"}) is False
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "completed"}) is False
    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: False)
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "generating"}) is True


def test_a7_custom_mode_clears_generating_when_sample_not_ready(monkeypatch):
    from voice_runtime_repair import _should_clear_stuck_session

    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: False)
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "generating"}) is True
    monkeypatch.setattr("voice_runtime_repair._active_sample_ready", lambda: True)
    assert _should_clear_stuck_session({"flow": "create_voice", "phase": "generating"}) is False
