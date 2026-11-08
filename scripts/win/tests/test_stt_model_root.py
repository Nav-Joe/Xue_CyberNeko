"""环境页传入的可写根优先于脚本所在位置。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "download-stt-models.py"


def load_module():
    spec = importlib.util.spec_from_file_location("download_stt_models", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_repo_root_uses_data_root(monkeypatch, tmp_path: Path) -> None:
    module = load_module()
    monkeypatch.setenv("XUE_DATA_ROOT", str(tmp_path))
    assert module.repo_root() == tmp_path


def test_repo_root_defaults_to_script_parents(monkeypatch) -> None:
    module = load_module()
    monkeypatch.delenv("XUE_DATA_ROOT", raising=False)
    assert module.repo_root() == SCRIPT.resolve().parents[2]
