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

def _path_from_env(name: str) -> Path | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    return Path(raw)


def _default_project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def source_root() -> Path:
    """只读根。安装包里由主进程传入；没传时就是 tts_voice 的上一级。"""
    return _path_from_env("XUE_INSTALL_ROOT") or _default_project_root()


def writable_root() -> Path:
    """数据根。安装包里放 .runtime、voice_forge 和权重；没传时与只读根相同。"""
    return _path_from_env("XUE_DATA_ROOT") or _default_project_root()


def resolve_under_writable_root(raw: str) -> Path:
    """相对路径挂在数据根上。绝对路径保持原样，避免把用户给的盘符再拼一次。"""
    path = Path(raw)
    if path.is_absolute():
        return path
    return writable_root() / path


# 进程启动时读一次环境变量。开发脚本不传这两个变量，所以两个根仍是同一目录。
# PROJECT_ROOT 必须留在只读根：默认语料在 src/data，不能跟 .runtime 一起挪到数据根。
PROJECT_ROOT = source_root()
BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.yaml"
RUNTIME_DIR = writable_root() / ".runtime"

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
