"""TTS 引擎统一抽象接口。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class EngineCapabilities:
    """引擎能力声明，供 tts_server 与语料缓存决策。"""

    voice_forge: bool = False
    supports_corpus_cache: bool = True


@runtime_checkable
class TtsEngine(Protocol):
    def warmup(self) -> None: ...

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes: ...

    @property
    def capabilities(self) -> EngineCapabilities: ...

    @property
    def clone_reference_path(self) -> Path | None: ...
