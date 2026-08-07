"""SenseVoice（sherpa-onnx）加载与整段解码。"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

# 仓库根：stt_service/ → 上一级
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_REL = Path(".runtime/stt-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09")

ENV_MODEL_DIR = "XUE_STT_MODEL_DIR"


@dataclass(frozen=True)
class DecodeResult:
    text: str
    decode_ms: int
    language: str


def resolve_model_dir() -> Optional[Path]:
    override = os.environ.get(ENV_MODEL_DIR, "").strip()
    if override:
        path = Path(override)
        return path if _dir_has_model(path) else None

    primary = _REPO_ROOT / _DEFAULT_REL
    if _dir_has_model(primary):
        return primary

    # 兼容旧探针目录名
    legacy = _REPO_ROOT / ".runtime/stt-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"
    if _dir_has_model(legacy):
        return legacy
    return None


def _dir_has_model(path: Path) -> bool:
    if not path.is_dir():
        return False
    tokens = path / "tokens.txt"
    model = path / "model.int8.onnx"
    if not model.is_file():
        model = path / "model.onnx"
    return tokens.is_file() and model.is_file()


def _model_files(model_dir: Path) -> tuple[Path, Path]:
    tokens = model_dir / "tokens.txt"
    model = model_dir / "model.int8.onnx"
    if not model.is_file():
        model = model_dir / "model.onnx"
    return model, tokens


class SenseVoiceEngine:
    """进程内单例式引擎；启动时 load。"""

    def __init__(self, num_threads: int = 2) -> None:
        self._num_threads = num_threads
        self._recognizer = None
        self._model_dir: Optional[Path] = None
        self._load_error: Optional[str] = None

    @property
    def model_ready(self) -> bool:
        return self._recognizer is not None

    @property
    def model_dir(self) -> Optional[Path]:
        return self._model_dir

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    def load(self) -> bool:
        model_dir = resolve_model_dir()
        if model_dir is None:
            self._load_error = (
                f"model dir not found (set {ENV_MODEL_DIR} or place files under {_DEFAULT_REL})"
            )
            self._recognizer = None
            self._model_dir = None
            return False
        model, tokens = _model_files(model_dir)
        try:
            import sherpa_onnx

            self._recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                model=str(model),
                tokens=str(tokens),
                num_threads=self._num_threads,
                use_itn=True,
                debug=False,
                language="auto",
            )
            self._model_dir = model_dir
            self._load_error = None
            return True
        except Exception as exc:  # noqa: BLE001 — 启动路径需吞住并暴露人话
            self._recognizer = None
            self._model_dir = model_dir
            self._load_error = str(exc)
            return False

    def decode(
        self,
        samples: np.ndarray,
        sample_rate: int,
        language: str = "auto",
    ) -> DecodeResult:
        if self._recognizer is None:
            raise RuntimeError(self._load_error or "model_not_ready")

        # sherpa from_sense_voice 在构造时固定 language；
        # 请求里带的 language 若不是 auto，目前只回写到响应，不重建引擎（重建成本高且少见）。
        stream = self._recognizer.create_stream()
        stream.accept_waveform(sample_rate, samples)
        t0 = time.perf_counter()
        self._recognizer.decode_stream(stream)
        decode_ms = int(round((time.perf_counter() - t0) * 1000))
        text = (stream.result.text or "").strip()
        return DecodeResult(text=text, decode_ms=decode_ms, language=language or "auto")
