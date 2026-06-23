"""项目路径常量（供 voice_forge / touch_mode 等模块共用）。"""

from __future__ import annotations

from tts_config import PROJECT_ROOT, RUNTIME_DIR, read_engine_name

__all__ = ["PROJECT_ROOT", "RUNTIME_DIR", "read_backend"]


def read_backend() -> str:
    """兼容旧调用方：返回当前 TTS 引擎名。"""
    return read_engine_name()
