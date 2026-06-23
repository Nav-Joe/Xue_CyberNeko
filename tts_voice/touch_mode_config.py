"""触摸反馈模式：精选音频库（默认）或自定义语料 + TTS 缓存。"""

from __future__ import annotations

import os
from pathlib import Path

from backend_config import PROJECT_ROOT, RUNTIME_DIR

TOUCH_MODE_FILE = RUNTIME_DIR / "touch-mode.env"
DEFAULT_CORPUS_PATH = PROJECT_ROOT / "src" / "data" / "corpus.json"
CUSTOM_CORPUS_PATH = RUNTIME_DIR / "corpus.custom.json"

VALID_TOUCH_MODES = frozenset({"curated", "custom_corpus", "alt_engine_corpus"})


def is_corpus_touch_mode(value: str | None = None) -> bool:
    mode = normalize_touch_mode(value) if value else read_touch_mode()
    return mode in ("custom_corpus", "alt_engine_corpus")


def normalize_touch_mode(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip().lower().split("#", 1)[0].strip()
    if raw in ("alt_engine", "alt_engine_corpus", "alt-corpus", "third_party"):
        return "alt_engine_corpus"
    if raw in ("custom", "custom_corpus", "corpus"):
        return "custom_corpus"
    if raw in ("curated", "clips", "default"):
        return "curated"
    if raw in VALID_TOUCH_MODES:
        return raw
    return None


def read_touch_mode() -> str:
    env_mode = normalize_touch_mode(os.environ.get("TOUCH_MODE"))
    if env_mode:
        return env_mode

    if TOUCH_MODE_FILE.is_file():
        for line in TOUCH_MODE_FILE.read_text(encoding="utf-8").splitlines():
            parsed = normalize_touch_mode(line)
            if parsed:
                return parsed

    return "curated"


def resolve_corpus_path() -> Path:
    mode = read_touch_mode()
    if mode in ("custom_corpus", "alt_engine_corpus") and CUSTOM_CORPUS_PATH.is_file():
        return CUSTOM_CORPUS_PATH
    return DEFAULT_CORPUS_PATH


def write_touch_mode(mode: str) -> Path:
    normalized = normalize_touch_mode(mode)
    if not normalized:
        raise ValueError(f"不支持的触摸模式: {mode}")

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    TOUCH_MODE_FILE.write_text(f"{normalized}\n", encoding="utf-8")
    return TOUCH_MODE_FILE
