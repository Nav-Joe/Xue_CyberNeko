"""Python reconcile 行为锁 + CONTRACT 不对称对照。

修改本文件或 voice_runtime_repair.py 前请同步阅读：
  electron/main/config/CONTRACT.md §已知不对称（A1–A7）

本轮 OPT-01 方案 A：只锁「当前 Python 行为」与契约标注；
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
    # CONTRACT 不对称 A1：Python 在 alt_engine 且 corpus.custom.json 缺失时回退 curated；
    # Electron reconcile #4 early return 不检查该文件（有意保留，业务语义待后续决策统一）。
    # 须 patch repair 模块内已绑定的 read_engine_name（仅改 tts_config 不够）。
    monkeypatch.setattr("voice_runtime_repair.read_engine_name", lambda: "bert_vits2")
    mock_engine_name("bert_vits2")
    disk.write_touch_mode("alt_engine_corpus")
    from touch_mode_config import CUSTOM_CORPUS_PATH

    assert not CUSTOM_CORPUS_PATH.is_file()
    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_invalid_custom_corpus_falls_back_to_curated_and_clears_stuck_session(disk, mock_engine_name):
    # CONTRACT 不对称 A2（部分）：Python 无效 custom → curated + 可清 session；
    # 同测下方另断言「不删盘 / 不重写 forge」（A2 破坏性差异）。
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
    # CONTRACT 不对称 A2：Electron #5 会 rmSync orphan + 重置 official activeSample；
    # Python 仅改 touch-mode，保留样本目录与 voice-forge.json activeSample
    # （有意保留，业务语义待后续决策统一）。
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
    # CONTRACT 不对称 A5：Python _active_sample_ready 要求 wav+txt；
    # Electron sampleHasReference 仅检查 wav → 同目录 TS 可能仍判「有参考音」。
    # （有意保留，业务语义待后续决策统一。）
    mock_engine_name("qwen")
    sample_dir = voice_forge_paths.CUSTOM_SAMPLE_DIR / "wav_only"
    sample_dir.mkdir(parents=True, exist_ok=True)
    (sample_dir / voice_forge_paths.REF_WAV_NAME).write_bytes(b"x")
    # 故意不写 reference.txt
    disk.write_touch_mode("custom_corpus")
    disk.write_voice_forge({"activeSample": {"folderId": "wav_only", "kind": "custom"}})

    assert reconcile_runtime_voice_config() == "curated"
    assert disk.read_touch_mode() == "curated"


def test_curated_official_active_sample_ready_upgrades_to_custom_corpus(disk, mock_engine_name):
    # CONTRACT 不对称 A6（Python 侧）：#7 升级谓词是 _active_sample_ready（wav+txt），
    # 不要求 touch_cache；Electron 则要求 isOfficialTouchCacheReady()。
    # 本用例：有 reference、无 touch_cache → Python 仍升级（有意保留差异）。
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
    assert reconcile_runtime_voice_config() == "custom_corpus"
    assert disk.read_touch_mode() == "custom_corpus"


def test_cancelled_session_is_ignored_by_python(disk, mock_engine_name):
    # CONTRACT 不对称 A3：Electron #1 对 phase=cancelled 调 cancelVoiceForgeReview；
    # Python 无对应分支，会话残留、mode 不变（有意保留，业务语义待后续决策统一）。
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
    # CONTRACT 不对称 A4：Electron #4 early return 跳过 #8；
    # Python 在 alt 保持后仍可清 prewarming session（有意保留，业务语义待后续决策统一）。
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
