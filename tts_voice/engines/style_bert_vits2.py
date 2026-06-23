"""Style-Bert-VITS2 插件占位。对接说明见 tts_voice/ENGINE_HOOKS.md。"""

from __future__ import annotations


def create_engine():
    raise RuntimeError(
        "Style-Bert-VITS2 尚未实现：请在本文件提供 create_engine()，"
        "返回实现 engines.base.TtsEngine 协议的实例。说明见 tts_voice/ENGINE_HOOKS.md"
    )
