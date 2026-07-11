from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

import backend_config
import touch_mode_config
import voice_forge_paths
import voice_forge_session
from services.runtime_state import AppRuntime, RuntimeStore


@dataclass
class DiskFixture:
    runtime: Path
    default_sample: Path

    def write_touch_mode(self, mode: str) -> None:
        touch_mode_config.TOUCH_MODE_FILE.write_text(f"{mode}\n", encoding="utf-8")

    def write_voice_forge(self, payload: dict) -> None:
        self.runtime.mkdir(parents=True, exist_ok=True)
        voice_forge_paths.VOICE_FORGE_CONFIG_FILE.write_text(
            json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    def write_reference(self, sample_dir: Path) -> None:
        sample_dir.mkdir(parents=True, exist_ok=True)
        (sample_dir / voice_forge_paths.REF_WAV_NAME).write_bytes(b"x")
        (sample_dir / voice_forge_paths.REF_TEXT_NAME).write_text("t", encoding="utf-8")

    def write_prewarm_flag(self, target: str) -> None:
        voice_forge_paths.write_corpus_prewarm_flag(target)

    def read_touch_mode(self) -> str:
        return touch_mode_config.read_touch_mode()


@pytest.fixture
def disk(tmp_path, monkeypatch) -> DiskFixture:
    root = tmp_path
    runtime = root / ".runtime"
    voice_forge = root / "voice_forge"
    default_sample = voice_forge / "default_sample"
    runtime.mkdir()
    voice_forge.mkdir()
    custom_sample = voice_forge / "custom_sample"
    custom_sample.mkdir(parents=True, exist_ok=True)

    for mod, name, value in (
        (backend_config, "RUNTIME_DIR", runtime),
        (backend_config, "PROJECT_ROOT", root),
        (touch_mode_config, "RUNTIME_DIR", runtime),
        (touch_mode_config, "PROJECT_ROOT", root),
        (touch_mode_config, "TOUCH_MODE_FILE", runtime / "touch-mode.env"),
        (touch_mode_config, "CUSTOM_CORPUS_PATH", runtime / "corpus.custom.json"),
        (voice_forge_paths, "RUNTIME_DIR", runtime),
        (voice_forge_paths, "PROJECT_ROOT", root),
        (voice_forge_paths, "VOICE_FORGE_ROOT", voice_forge),
        (voice_forge_paths, "DEFAULT_SAMPLE_DIR", default_sample),
        (voice_forge_paths, "CUSTOM_SAMPLE_DIR", custom_sample),
        (voice_forge_paths, "VOICE_FORGE_CONFIG_FILE", runtime / "voice-forge.json"),
        (voice_forge_paths, "CORPUS_PREWARM_FLAG", runtime / "corpus-prewarm.flag"),
        (voice_forge_session, "SESSION_FILE", runtime / "voice-forge-session.json"),
    ):
        monkeypatch.setattr(mod, name, value)

    return DiskFixture(runtime=runtime, default_sample=default_sample)


@pytest.fixture
def mock_runtime() -> AppRuntime:
    return AppRuntime(RuntimeStore(touch_mode="custom_corpus", ready=True))


@pytest.fixture
def mock_engine_name(monkeypatch):
    def _set(name: str) -> str:
        monkeypatch.setattr("tts_config.read_engine_name", lambda: name)
        return name

    return _set
