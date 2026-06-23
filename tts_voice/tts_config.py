"""读取 tts_voice/config.yaml 中的 TTS 引擎配置。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - 开发环境应安装 PyYAML
    yaml = None

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.yaml"
RUNTIME_DIR = PROJECT_ROOT / ".runtime"

VALID_ENGINES = frozenset({"qwen", "bert_vits2", "style_bert_vits2"})


def normalize_engine(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip().lower().split("#", 1)[0].strip()
    aliases = {
        "bert": "bert_vits2",
        "bert-vits2": "bert_vits2",
        "bertvits": "bert_vits2",
        "bert_vits2": "bert_vits2",
        "bertvits2": "bert_vits2",
        "style": "style_bert_vits2",
        "style-bert-vits2": "style_bert_vits2",
        "style_bert_vits": "style_bert_vits2",
        "stylebertvits2": "style_bert_vits2",
    }
    if raw in aliases:
        return aliases[raw]
    if raw in VALID_ENGINES:
        return raw
    return None


def _default_config() -> dict[str, Any]:
    return {
        "engine": "qwen",
        "engines": {
            "qwen": {"config_path": "qwen_config.json"},
            "bert_vits2": {
                "config_path": "config.json",
                "model_path": "G_900.pth",
                "root": "../Bert-VITS2",
            },
            "style_bert_vits2": {
                "config_path": "config.json",
                "model_path": "G_900.pth",
            },
        },
    }


def _parse_yaml_text(text: str) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("缺少 PyYAML，请执行: pip install pyyaml")
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        return _default_config()
    return data


@lru_cache(maxsize=1)
def load_tts_config() -> dict[str, Any]:
    if CONFIG_PATH.is_file():
        return _parse_yaml_text(CONFIG_PATH.read_text(encoding="utf-8"))
    return _default_config()


def read_engine_name() -> str:
    env_engine = normalize_engine(os.environ.get("TTS_ENGINE") or os.environ.get("TTS_BACKEND"))
    if env_engine:
        return env_engine

    config = load_tts_config()
    configured = normalize_engine(str(config.get("engine", "qwen")))
    return configured or "qwen"


def get_engine_config(engine_name: str | None = None) -> dict[str, Any]:
    name = engine_name or read_engine_name()
    config = load_tts_config()
    engines = config.get("engines")
    if not isinstance(engines, dict):
        return {}
    engine_cfg = engines.get(name)
    if isinstance(engine_cfg, dict):
        return dict(engine_cfg)
    return {}


def write_engine_name(engine_name: str) -> Path:
    normalized = normalize_engine(engine_name)
    if not normalized:
        raise ValueError(f"不支持的 TTS 引擎: {engine_name}")

    if yaml is None:
        raise RuntimeError("缺少 PyYAML，请执行: pip install pyyaml")

    config = load_tts_config()
    config["engine"] = normalized
    CONFIG_PATH.write_text(
        yaml.safe_dump(config, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    load_tts_config.cache_clear()
    return CONFIG_PATH
