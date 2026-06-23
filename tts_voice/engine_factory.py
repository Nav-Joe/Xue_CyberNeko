"""按 config.yaml 创建 TTS 引擎。"""

from __future__ import annotations

import os
from pathlib import Path

from engines.registry import create_engine as _create_engine

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
MODEL_PATH = BASE_DIR / "G_900.pth"
QWEN_CONFIG_PATH = BASE_DIR / "qwen_config.json"


def create_engine():
    use_clone = os.environ.get("QWEN_USE_CLONE", "").strip().lower() in {"1", "true", "yes"}
    force_regen = os.environ.get("QWEN_FORCE_REGENERATE_VOICE", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    allow_ref_gen = os.environ.get("QWEN_ALLOW_REFERENCE_GENERATE", "0").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    runtime = {
        "use_clone": use_clone,
        "force_regenerate_reference": force_regen,
        "allow_reference_generate": allow_ref_gen,
    }
    return _create_engine(runtime)
