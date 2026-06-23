"""送进 TTS 前的文本规范化（界面语料仍可保留 ~）。"""

from __future__ import annotations

import re


def normalize_tts_text(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return cleaned

    cleaned = cleaned.replace("～", "，").replace("~", "，")
    cleaned = re.sub(r"，{2,}", "，", cleaned)
    cleaned = re.sub(r"，([。！？!?])", r"\1", cleaned)
    return cleaned.strip()
