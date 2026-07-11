"""切换 TTS 引擎时清理运行时污染（不读写 qwen_config.json / config.yaml 磁盘文件）。"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_BERT_VITS2_ROOT = _BASE_DIR.parent / "Bert-VITS2"

# Bert-VITS2 导入时占用的 top-level 模块名（非 Qwen 配置）
_BERT_TOP_LEVEL_MODULES = frozenset(
    {
        "config",
        "infer",
        "utils",
        "commons",
        "models",
        "attentions",
        "data_utils",
        "mel_processing",
        "module",
        "monotonic_align",
    }
)

_BERT_MODULE_PREFIXES = ("text.",)


def _resolve_engine_path(value: str | None, *, default: Path) -> Path:
    if not value:
        return default.resolve()
    path = Path(value)
    if not path.is_absolute():
        path = (_BASE_DIR / path).resolve()
    return path


def bert_vits2_roots() -> list[str]:
    roots: list[str] = []
    try:
        from tts_config import get_engine_config

        cfg = get_engine_config("bert_vits2")
        root_raw = cfg.get("root")
        if root_raw:
            roots.append(str(_resolve_engine_path(str(root_raw), default=_DEFAULT_BERT_VITS2_ROOT)))
        env_root = os.environ.get("BERT_VITS2_ROOT")
        if env_root:
            roots.append(str(Path(env_root).resolve()))
    except Exception:  # noqa: BLE001
        pass
    roots.append(str(_DEFAULT_BERT_VITS2_ROOT.resolve()))
    return list(dict.fromkeys(roots))


def purge_bert_vits2_modules() -> list[str]:
    removed: list[str] = []
    for name in list(sys.modules.keys()):
        if name in _BERT_TOP_LEVEL_MODULES or any(name.startswith(p) for p in _BERT_MODULE_PREFIXES):
            sys.modules.pop(name, None)
            removed.append(name)
    return removed


def remove_sys_paths(paths: list[str]) -> None:
    normalized = {str(Path(p).resolve()) for p in paths if p}
    sys.path[:] = [entry for entry in sys.path if str(Path(entry).resolve()) not in normalized]


def prepare_qwen_runtime(*, use_clone: bool = False) -> None:
    """加载 Qwen 前：清除 Bert 运行时占用，恢复 Qwen 环境。"""
    purge_bert_vits2_modules()
    remove_sys_paths(bert_vits2_roots())
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.pop("HF_ENDPOINT", None)
    os.environ.pop("TTS_FP16", None)
    if not use_clone:
        os.environ.pop("QWEN_USE_CLONE", None)
        os.environ.pop("QWEN_FORCE_REGENERATE_VOICE", None)
        os.environ.pop("QWEN_ALLOW_REFERENCE_GENERATE", None)


def prepare_bert_vits2_runtime() -> None:
    """加载 Bert-VITS2 前：清除 Qwen 克隆 env，避免 HF 离线阻止 Bert 拉权重。"""
    purge_bert_vits2_modules()
    os.environ.pop("QWEN_USE_CLONE", None)
    os.environ.pop("QWEN_FORCE_REGENERATE_VOICE", None)
    os.environ.pop("QWEN_ALLOW_REFERENCE_GENERATE", None)
    os.environ.pop("HF_HUB_OFFLINE", None)
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")


def release_engine_runtime() -> None:
    """卸载引擎时清理（切换引擎 / 进程内重载预留）。"""
    purge_bert_vits2_modules()
    remove_sys_paths(bert_vits2_roots())
