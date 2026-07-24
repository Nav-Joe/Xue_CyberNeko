"""Qwen3-TTS 模型加载共用：设备 / dtype / attn（默认 sdpa，失败回落 eager）。"""

from __future__ import annotations

import os
from pathlib import Path

import torch


def prepare_torch_env() -> tuple[str, torch.dtype]:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.pop("HF_ENDPOINT", None)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    return device, dtype


def resolve_attn_implementation(settings: dict | None = None, override: str | None = None) -> str:
    """默认 sdpa；可用 qwen_config.json / 环境变量 QWEN_ATTN_IMPLEMENTATION 覆盖。"""
    raw = override
    if raw is None and settings is not None:
        raw = settings.get("attn_implementation")
    if raw is None:
        raw = os.environ.get("QWEN_ATTN_IMPLEMENTATION", "sdpa")
    value = str(raw).strip().lower()
    if value not in ("eager", "sdpa", "flash_attention_2"):
        print(f"[TTS/Qwen] 未知 attn_implementation={raw!r}，回落 sdpa", flush=True)
        return "sdpa"
    return value


def load_qwen3_tts_model(
    model_dir: str | Path,
    *,
    device: str,
    dtype: torch.dtype,
    attn_implementation: str,
):
    """加载 Qwen3TTSModel；非 eager 失败时回落 eager。返回 (model, 实际 attn)。"""
    from qwen_tts import Qwen3TTSModel

    preferred = resolve_attn_implementation(override=attn_implementation)
    try:
        model = Qwen3TTSModel.from_pretrained(
            str(model_dir),
            device_map=device,
            dtype=dtype,
            attn_implementation=preferred,
        )
        return model, preferred
    except Exception as exc:
        if preferred == "eager":
            raise
        print(
            f"[TTS/Qwen] attn={preferred} 加载失败，回落 eager: {exc}",
            flush=True,
        )
        model = Qwen3TTSModel.from_pretrained(
            str(model_dir),
            device_map=device,
            dtype=dtype,
            attn_implementation="eager",
        )
        return model, "eager"
