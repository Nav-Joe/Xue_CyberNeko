"""TTS 引擎插件注册表。"""

from engines.registry import create_engine, engine_supports_voice_forge, list_engines, read_engine_name

__all__ = [
    "create_engine",
    "engine_supports_voice_forge",
    "list_engines",
    "read_engine_name",
]
