"""WAV 校验：16 kHz / mono / 16-bit / ≤60s（CONTRACT）。"""

from __future__ import annotations

import io
import wave
from dataclasses import dataclass

import numpy as np

EXPECTED_SAMPLE_RATE = 16000
MAX_DURATION_SEC = 60.0


class BadAudioError(ValueError):
    """格式不符合契约 → HTTP 400 bad_audio。"""


class TooLongError(ValueError):
    """超过时长上限 → HTTP 413 too_long。"""


@dataclass(frozen=True)
class WavPayload:
    samples: np.ndarray  # float32 [-1, 1]
    sample_rate: int
    duration_ms: int


def load_wav_bytes(data: bytes) -> WavPayload:
    if not data:
        raise BadAudioError("empty audio body")
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            rate = wf.getframerate()
            nframes = wf.getnframes()
            raw = wf.readframes(nframes)
    except wave.Error as exc:
        raise BadAudioError(f"invalid wav: {exc}") from exc

    if channels != 1:
        raise BadAudioError(f"expected mono, got channels={channels}")
    if sampwidth != 2:
        raise BadAudioError(f"expected 16-bit PCM (sampwidth=2), got {sampwidth}")
    if rate != EXPECTED_SAMPLE_RATE:
        raise BadAudioError(f"expected sample_rate={EXPECTED_SAMPLE_RATE}, got {rate}")
    if nframes <= 0:
        raise BadAudioError("wav has zero frames")

    duration_sec = nframes / float(rate)
    if duration_sec > MAX_DURATION_SEC:
        raise TooLongError(f"duration {duration_sec:.1f}s exceeds {MAX_DURATION_SEC:.0f}s")

    samples_i16 = np.frombuffer(raw, dtype=np.int16)
    samples = samples_i16.astype(np.float32) / 32768.0
    return WavPayload(
        samples=samples,
        sample_rate=rate,
        duration_ms=int(round(duration_sec * 1000)),
    )
