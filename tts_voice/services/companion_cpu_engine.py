"""屏幕陪玩旁白：懒加载 CPU 推理引擎（与聊天 GPU 主引擎并存，不占显存）。"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from engine_factory import QWEN_CONFIG_PATH
from services.batch_inference import dispatch_synthesize_immediate
from services.runtime_state import AppRuntime

_lock = threading.Lock()


def _engine_identity(engine: Any) -> str:
    ref = getattr(engine, "clone_reference_path", None)
    if ref is not None:
        try:
            return f"clone:{Path(ref).resolve()}"
        except OSError:
            return f"clone:{ref}"
    model_dir = getattr(engine, "model_dir", None)
    return f"design:{model_dir}"


def _clear_companion_cpu_engine_unlocked(runtime: AppRuntime) -> None:
    old = runtime.companion_cpu_engine
    runtime.companion_cpu_engine = None
    runtime.companion_cpu_engine_identity = None
    if old is None:
        return
    print("[TTS/Companion] CPU 旁白引擎已卸载", flush=True)
    try:
        from qwen_clone_setup import _unload_model

        _unload_model(getattr(old, "_model", None))
    except Exception:
        pass


def clear_companion_cpu_engine(runtime: AppRuntime) -> None:
    with _lock:
        _clear_companion_cpu_engine_unlocked(runtime)


def ensure_companion_cpu_engine(runtime: AppRuntime) -> Any:
    main = runtime.engine
    if main is None:
        raise RuntimeError("TTS 引擎尚未就绪")
    identity = _engine_identity(main)
    with _lock:
        cached = runtime.companion_cpu_engine
        if cached is not None and runtime.companion_cpu_engine_identity == identity:
            return cached

        _clear_companion_cpu_engine_unlocked(runtime)
        print(f"[TTS/Companion] 正在加载 CPU 旁白引擎 ({identity})…", flush=True)
        from qwen_engine import QwenCloneEngine, QwenVoiceDesignEngine

        ref = getattr(main, "clone_reference_path", None)
        if ref is not None:
            eng = QwenCloneEngine(
                QWEN_CONFIG_PATH,
                prefer_cpu=True,
                allow_reference_generate=False,
                reference_sample_dir=Path(ref).parent,
            )
        else:
            eng = QwenVoiceDesignEngine(QWEN_CONFIG_PATH, prefer_cpu=True)
        eng.warmup()
        runtime.companion_cpu_engine = eng
        runtime.companion_cpu_engine_identity = identity
        print("[TTS/Companion] CPU 旁白引擎就绪", flush=True)
        return eng


def synthesize_companion_tts(
    runtime: AppRuntime,
    text: str,
    *,
    speaker_id: int = 0,
    seed: int | None = None,
    order: int | None = None,
) -> bytes:
    if runtime.backend_name != "qwen":
        if runtime.engine is None:
            raise RuntimeError("TTS 引擎尚未就绪")
        return dispatch_synthesize_immediate(
            runtime.engine,
            text,
            speaker_id=speaker_id,
            seed=seed,
            order=order,
        )
    engine = ensure_companion_cpu_engine(runtime)
    return dispatch_synthesize_immediate(
        engine,
        text,
        speaker_id=speaker_id,
        seed=seed,
        order=order,
    )
