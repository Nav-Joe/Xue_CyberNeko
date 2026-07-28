"""OPT-09：audio_cache_policy 键 / 过期契约（ENGINE_HOOKS 全量 vs 增量）。"""

from __future__ import annotations

from pathlib import Path

import audio_cache_policy as policy


def _complete_entry(line: str, key: str | None = None) -> dict:
    return {
        "key": key or policy.text_key(line),
        "line_hash": policy.line_content_hash(line),
    }


class TestKeyHashes:
    def test_text_key_strips_and_truncates(self) -> None:
        assert policy.text_key("  hello  ") == policy.text_key("hello")
        assert len(policy.text_key("hello")) == 16

    def test_line_content_hash_matches_text_key_algo(self) -> None:
        # 历史实现：text_key 与 line_hash 同一算法，字段名不同
        assert policy.line_content_hash("你好") == policy.text_key("你好")

    def test_source_hash_combines_engine_and_corpus(self) -> None:
        a = policy.source_hash_from_parts("engine-aaa", b"corpus-1")
        b = policy.source_hash_from_parts("engine-aaa", b"corpus-2")
        c = policy.source_hash_from_parts("engine-bbb", b"corpus-1")
        assert a != b and a != c
        assert len(a) == 24


class TestCollectLines:
    def test_collect_unique_sorted_strips(self) -> None:
        data = {
            "head": ["  alpha  ", "beta"],
            "body": ["beta", "gamma", ""],
            "noise": "not-a-list",
        }
        assert policy.collect_lines_from_corpus_data(data) == ["alpha", "beta", "gamma"]


class TestActiveSampleMatches:
    def test_non_qwen_always_ok(self) -> None:
        assert policy.active_sample_matches(
            "bert",
            {"active_sample": {"folderId": "a"}},
            "b",
        )

    def test_qwen_folder_mismatch_is_not_ok(self) -> None:
        assert not policy.active_sample_matches(
            "qwen",
            {"active_sample": {"folderId": "sample-a"}},
            "sample-b",
        )

    def test_qwen_missing_manifest_active_is_ok(self) -> None:
        assert policy.active_sample_matches("qwen", {}, "sample-a")


class TestShouldFullRebuild:
    """ENGINE_HOOKS：全量仅在引擎/声线变更、manifest 缺失等情况下触发。"""

    def test_missing_manifest_is_full(self) -> None:
        assert policy.should_full_rebuild(
            None,
            backend="qwen",
            engine_hash="e1",
            source_hash="s1",
            corpus_hash="c1",
            active_sample_ok=True,
        )

    def test_backend_change_is_full(self) -> None:
        assert policy.should_full_rebuild(
            {"backend": "bert", "engine_hash": "e1"},
            backend="qwen",
            engine_hash="e1",
            source_hash="s1",
            corpus_hash="c1",
            active_sample_ok=True,
        )

    def test_active_sample_mismatch_is_full(self) -> None:
        assert policy.should_full_rebuild(
            {"backend": "qwen", "engine_hash": "e1"},
            backend="qwen",
            engine_hash="e1",
            source_hash="s1",
            corpus_hash="c1",
            active_sample_ok=False,
        )

    def test_engine_hash_change_is_full(self) -> None:
        assert policy.should_full_rebuild(
            {"backend": "qwen", "engine_hash": "old"},
            backend="qwen",
            engine_hash="new",
            source_hash="s1",
            corpus_hash="c1",
            active_sample_ok=True,
        )

    def test_same_engine_hash_is_not_full_even_if_corpus_changed(self) -> None:
        # 语料变更走增量：有有效 engine_hash 且相等 → 不全量
        assert not policy.should_full_rebuild(
            {
                "backend": "qwen",
                "engine_hash": "e1",
                "source_hash": "old-source",
                "corpus_hash": "old-corpus",
            },
            backend="qwen",
            engine_hash="e1",
            source_hash="new-source",
            corpus_hash="new-corpus",
            active_sample_ok=True,
        )

    def test_legacy_no_engine_hash_source_equal_is_not_full(self) -> None:
        assert not policy.should_full_rebuild(
            {"backend": "qwen", "source_hash": "s1"},
            backend="qwen",
            engine_hash="e1",
            source_hash="s1",
            corpus_hash="c1",
            active_sample_ok=True,
        )

    def test_legacy_source_diff_same_corpus_is_full(self) -> None:
        # 无 engine_hash：source 变了但 corpus 指纹仍相同 → 视为引擎侧变更 → 全量
        assert policy.should_full_rebuild(
            {"backend": "qwen", "source_hash": "old", "corpus_hash": "c1"},
            backend="qwen",
            engine_hash="e1",
            source_hash="new",
            corpus_hash="c1",
            active_sample_ok=True,
        )


class TestIncrementalMissingLines:
    """ENGINE_HOOKS：修改语料后只重合成变更/新增句；未改动保留。"""

    def test_unchanged_complete_line_not_missing(self, tmp_path: Path) -> None:
        line = "未改动的句子"
        entry = _complete_entry(line)
        line_dir = tmp_path / entry["key"]
        line_dir.mkdir()
        for i in range(policy.VARIANT_COUNT):
            (line_dir / f"{i}.wav").write_bytes(b"x")

        missing = policy.lines_missing_from_cache(
            [line],
            {line: entry},
            cache_dir=tmp_path,
        )
        assert missing == []

    def test_changed_line_hash_is_missing(self, tmp_path: Path) -> None:
        line = "改过的句子"
        entry = {
            "key": policy.text_key(line),
            "line_hash": policy.line_content_hash("旧内容"),
        }
        line_dir = tmp_path / entry["key"]
        line_dir.mkdir()
        for i in range(policy.VARIANT_COUNT):
            (line_dir / f"{i}.wav").write_bytes(b"x")

        missing = policy.lines_missing_from_cache(
            [line],
            {line: entry},
            cache_dir=tmp_path,
        )
        assert missing == [line]

    def test_new_line_is_missing(self, tmp_path: Path) -> None:
        missing = policy.lines_missing_from_cache(
            ["全新句子"],
            {},
            cache_dir=tmp_path,
        )
        assert missing == ["全新句子"]

    def test_incomplete_wavs_is_missing(self, tmp_path: Path) -> None:
        line = "缺变体"
        entry = _complete_entry(line)
        line_dir = tmp_path / entry["key"]
        line_dir.mkdir()
        (line_dir / "0.wav").write_bytes(b"x")  # 缺 1、2

        missing = policy.lines_missing_from_cache(
            [line],
            {line: entry},
            cache_dir=tmp_path,
        )
        assert missing == [line]


class TestFolderIdAndEngineHash:
    def test_folder_id_prefers_profile(self, tmp_path: Path) -> None:
        sample = tmp_path / "sample"
        sample.mkdir()
        (sample / "profile.json").write_text('{"folderId": "from-profile"}', encoding="utf-8")
        (sample / "meta.json").write_text('{"folderId": "from-meta"}', encoding="utf-8")
        assert policy.folder_id_for_sample_dir(sample) == "from-profile"

    def test_engine_hash_stable_for_same_inputs(self, tmp_path: Path) -> None:
        cfg = tmp_path / "qwen_config.json"
        cfg.write_text("{}", encoding="utf-8")
        sample = tmp_path / "voice"
        sample.mkdir()
        (sample / "profile.json").write_text('{"folderId": "v1"}', encoding="utf-8")
        ref = sample / "reference.wav"
        ref.write_bytes(b"ref-bytes")

        a = policy.compute_engine_hash(
            "qwen",
            qwen_config_path=cfg,
            sample_dir=sample,
            qwen_clone_ref=ref,
        )
        b = policy.compute_engine_hash(
            "qwen",
            qwen_config_path=cfg,
            sample_dir=sample,
            qwen_clone_ref=ref,
        )
        assert a == b and len(a) == 24

    def test_engine_hash_changes_when_ref_changes(self, tmp_path: Path) -> None:
        cfg = tmp_path / "qwen_config.json"
        cfg.write_text("{}", encoding="utf-8")
        sample = tmp_path / "voice"
        sample.mkdir()
        (sample / "profile.json").write_text('{"folderId": "v1"}', encoding="utf-8")
        ref = sample / "reference.wav"
        ref.write_bytes(b"ref-a")
        h1 = policy.compute_engine_hash(
            "qwen",
            qwen_config_path=cfg,
            sample_dir=sample,
            qwen_clone_ref=ref,
        )
        ref.write_bytes(b"ref-b")
        h2 = policy.compute_engine_hash(
            "qwen",
            qwen_config_path=cfg,
            sample_dir=sample,
            qwen_clone_ref=ref,
        )
        assert h1 != h2
