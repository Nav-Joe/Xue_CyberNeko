"""按 config.yaml 创建 TTS 引擎实例。"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from engines.base import TtsEngine
from tts_config import get_engine_config, read_engine_name

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BERT_VITS2_ROOT = BASE_DIR.parent / "Bert-VITS2"


def list_engines() -> list[str]:
    from tts_config import load_tts_config

    config = load_tts_config()
    engines = config.get("engines")
    if isinstance(engines, dict):
        return sorted(str(name) for name in engines.keys())
    return ["qwen"]


def engine_supports_voice_forge(engine_name: str | None = None) -> bool:
    name = (engine_name or read_engine_name()).strip()
    return name == "qwen"


def _resolve_path(value: str | None, *, default: Path | None = None) -> Path:
    if not value:
        if default is None:
            raise ValueError("缺少路径配置")
        return default
    path = Path(value)
    if not path.is_absolute():
        path = (BASE_DIR / path).resolve()
    return path


def resolve_engine_asset_paths(engine_name: str | None = None) -> dict[str, Path]:
    """解析 config.yaml 中声明的推理 config / 权重路径（供缓存指纹与引擎加载共用）。"""
    name = engine_name or read_engine_name()
    engine_cfg = get_engine_config(name)
    if name == "qwen":
        return {
            "config_path": _resolve_path(
                engine_cfg.get("config_path"),
                default=BASE_DIR / "qwen_config.json",
            )
        }
    return {
        "config_path": _resolve_path(
            engine_cfg.get("config_path"),
            default=BASE_DIR / "config.json",
        ),
        "model_path": _resolve_path(
            engine_cfg.get("model_path"),
            default=BASE_DIR / "G_900.pth",
        ),
    }


def _create_qwen(engine_cfg: dict[str, Any], runtime: dict[str, Any]) -> TtsEngine:
    from qwen_engine import create_engine as create_qwen_engine

    config_path = _resolve_path(engine_cfg.get("config_path"), default=BASE_DIR / "qwen_config.json")
    return create_qwen_engine(
        config_path,
        use_clone=bool(runtime.get("use_clone")),
        force_regenerate_reference=bool(runtime.get("force_regenerate_reference")),
        allow_reference_generate=bool(runtime.get("allow_reference_generate", True)),
    )


def _create_bert_vits2(engine_cfg: dict[str, Any], runtime: dict[str, Any]) -> TtsEngine:
    del runtime
    from infer_engine import create_engine as create_bert_engine

    config_path = _resolve_path(engine_cfg.get("config_path"), default=BASE_DIR / "config.json")
    model_path = _resolve_path(engine_cfg.get("model_path"), default=BASE_DIR / "G_900.pth")
    root_raw = engine_cfg.get("root")
    if root_raw:
        root = _resolve_path(str(root_raw))
    else:
        root = Path(os.environ.get("BERT_VITS2_ROOT", str(DEFAULT_BERT_VITS2_ROOT))).resolve()
    return create_bert_engine(config_path=config_path, model_path=model_path, bert_vits2_root=root)


def _create_style_bert_vits2(engine_cfg: dict[str, Any], runtime: dict[str, Any]) -> TtsEngine:
    del engine_cfg, runtime
    try:
        from engines.style_bert_vits2 import create_engine as create_style_engine
    except ImportError as error:
        raise RuntimeError(
            "Style-Bert-VITS2 尚未对接：请在 tts_voice/engines/style_bert_vits2.py 实现 create_engine()，"
            "并放置私有权重。说明见 tts_voice/ENGINE_HOOKS.md"
        ) from error
    return create_style_engine()


_CREATORS = {
    "qwen": _create_qwen,
    "bert_vits2": _create_bert_vits2,
    "style_bert_vits2": _create_style_bert_vits2,
}


def create_engine(runtime: dict[str, Any] | None = None) -> tuple[str, TtsEngine]:
    runtime_opts = dict(runtime or {})
    engine_name = read_engine_name()
    engine_cfg = get_engine_config(engine_name)

    creator = _CREATORS.get(engine_name)
    if creator is None:
        raise RuntimeError(
            f"未知 TTS 引擎: {engine_name}。请在 tts_voice/config.yaml 的 engines 中声明，"
            "并在 tts_voice/engines/registry.py 注册。"
        )

    if engine_name == "qwen":
        mode = "VoiceDesign+Base 克隆" if runtime_opts.get("use_clone") else "VoiceDesign"
        print(f"[TTS] 引擎=qwen ({mode})", flush=True)
    else:
        print(f"[TTS] 引擎={engine_name}", flush=True)

    return engine_name, creator(engine_cfg, runtime_opts)
