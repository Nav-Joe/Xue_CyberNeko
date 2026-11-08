"""安装包传入数据根时，可写目录和默认语料要拆开。不设变量时与现在一致。"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

import backend_config
import touch_mode_config
import tts_config
import voice_forge_paths


def _reload_roots() -> None:
    importlib.reload(tts_config)
    importlib.reload(backend_config)
    importlib.reload(touch_mode_config)
    importlib.reload(voice_forge_paths)


def test_unset_env_keeps_parent_of_tts_voice(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("XUE_DATA_ROOT", raising=False)
    monkeypatch.delenv("XUE_INSTALL_ROOT", raising=False)
    parent = Path(tts_config.__file__).resolve().parent.parent
    assert tts_config.source_root() == parent
    assert tts_config.writable_root() == parent


def test_relative_model_dir_uses_data_root(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    data = tmp_path / "data"
    monkeypatch.setenv("XUE_DATA_ROOT", str(data))
    monkeypatch.delenv("XUE_INSTALL_ROOT", raising=False)
    got = tts_config.resolve_under_writable_root("Qwen3_TTS/models/demo")
    assert got == data / "Qwen3_TTS" / "models" / "demo"
    assert tts_config.resolve_under_writable_root(r"D:\weights\model") == Path(r"D:\weights\model")


def test_import_time_roots_split_runtime_and_corpus(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    data = tmp_path / "data"
    install = tmp_path / "app"
    monkeypatch.setenv("XUE_DATA_ROOT", str(data))
    monkeypatch.setenv("XUE_INSTALL_ROOT", str(install))
    try:
        _reload_roots()
        assert tts_config.RUNTIME_DIR == data / ".runtime"
        assert voice_forge_paths.VOICE_FORGE_ROOT == data / "voice_forge"
        assert voice_forge_paths.LEGACY_CLONE_DIR == data / ".runtime" / "qwen-clone"
        assert touch_mode_config.DEFAULT_CORPUS_PATH == install / "src" / "data" / "corpus.json"
        assert tts_config.PROJECT_ROOT == install
    finally:
        monkeypatch.delenv("XUE_DATA_ROOT", raising=False)
        monkeypatch.delenv("XUE_INSTALL_ROOT", raising=False)
        _reload_roots()
