"""Qwen3-TTS 推理封装：精选模式 VoiceDesign；自定义语料模式 VoiceDesign 参考音 + Base 克隆。"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample

from engines.base import EngineCapabilities
from qwen_clone_setup import (
    base_model_dir,
    ensure_clone_reference,
    voice_design_model_dir,
)
from text_normalize import normalize_tts_text
from voice_forge_config import load_merged_qwen_settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "qwen_config.json"


def _prepare_torch_env() -> tuple[str, torch.dtype]:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.pop("HF_ENDPOINT", None)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    return device, dtype


class QwenVoiceDesignEngine:
    """默认后端：按 instruct 现场合成（精选模式 / 无克隆预热）。"""

    def __init__(self, config_path: Path = DEFAULT_CONFIG_PATH) -> None:
        self._config_path = config_path
        self._settings = self._load_settings(config_path)
        self._model_dir = voice_design_model_dir(self._settings)
        self._language = self._settings.get("language", "Chinese")
        self._instruct = self._settings.get("instruct", "").strip()
        self._target_sr = int(self._settings.get("target_sample_rate", 22050))
        self._generation = dict(self._settings.get("generation") or {})
        self._device, self._dtype = _prepare_torch_env()

        from qwen_tts import Qwen3TTSModel

        print(
            f"[TTS/Qwen] 正在加载 VoiceDesign 模型...\n"
            f"           path={self._model_dir}\n"
            f"           device={self._device}",
            flush=True,
        )
        self._model = Qwen3TTSModel.from_pretrained(
            str(self._model_dir),
            device_map=self._device,
            dtype=self._dtype,
            attn_implementation="eager",
        )
        print(f"[TTS/Qwen] instruct={self._instruct[:48]}...", flush=True)

    @staticmethod
    def _load_settings(config_path: Path) -> dict:
        return load_merged_qwen_settings(config_path)

    def warmup(self) -> None:
        print("[TTS/Qwen] 正在预热...", flush=True)
        self.synthesize("你好。")
        print("[TTS/Qwen] 预热完成", flush=True)

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        del speaker_id

        normalized = normalize_tts_text(text)
        if not normalized:
            raise ValueError("text 不能为空")

        if seed is not None:
            torch.manual_seed(seed)
            np.random.seed(seed % (2**32 - 1))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        with torch.no_grad():
            wavs, sample_rate = self._model.generate_voice_design(
                text=normalized,
                language=self._language,
                instruct=self._instruct,
                **self._generation,
            )

        return self._to_wav_bytes(wavs[0], sample_rate)

    def _to_wav_bytes(self, wav: np.ndarray, sample_rate: int) -> bytes:
        audio = np.asarray(wav, dtype=np.float32)
        if sample_rate != self._target_sr:
            target_len = max(1, int(len(audio) * self._target_sr / sample_rate))
            audio = resample(audio, target_len).astype(np.float32)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self._target_sr, format="WAV")
        return buffer.getvalue()

    @property
    def config_path(self) -> Path:
        return self._config_path

    @property
    def model_dir(self) -> Path:
        return self._model_dir

    @property
    def instruct(self) -> str:
        return self._instruct

    @property
    def capabilities(self) -> EngineCapabilities:
        return EngineCapabilities(voice_forge=True, supports_corpus_cache=True)

    @property
    def clone_reference_path(self) -> Path | None:
        return None


class QwenCloneEngine:
    """自定义语料模式：VoiceDesign 参考音 + Base 克隆，预热与实时推理音色一致。"""

    def __init__(
        self,
        config_path: Path = DEFAULT_CONFIG_PATH,
        *,
        force_regenerate_reference: bool = False,
        allow_reference_generate: bool = True,
        reference_sample_dir: Path | None = None,
    ) -> None:
        self._config_path = config_path
        self._settings = QwenVoiceDesignEngine._load_settings(config_path)
        self._language = self._settings.get("language", "Chinese")
        self._target_sr = int(self._settings.get("target_sample_rate", 22050))
        self._generation = dict(self._settings.get("generation") or {})
        self._device, self._dtype = _prepare_torch_env()

        if reference_sample_dir is not None:
            from qwen_clone_setup import load_reference

            ref_path, ref_text = load_reference(reference_sample_dir)
            print(
                f"[TTS/Qwen Clone] 使用指定声线样本: {ref_path} (folder={reference_sample_dir.name})",
                flush=True,
            )
        else:
            ref_path, ref_text = ensure_clone_reference(
                self._settings,
                force=force_regenerate_reference,
                allow_generate=allow_reference_generate,
            )
        self._reference_path = ref_path
        self._reference_text = ref_text
        self._model_dir = base_model_dir(self._settings)

        from qwen_tts import Qwen3TTSModel

        print(
            f"[TTS/Qwen Clone] 正在加载 Base 克隆模型...\n"
            f"                 path={self._model_dir}\n"
            f"                 ref={self._reference_path}",
            flush=True,
        )
        self._model = Qwen3TTSModel.from_pretrained(
            str(self._model_dir),
            device_map=self._device,
            dtype=self._dtype,
            attn_implementation="eager",
        )
        self._voice_clone_prompt = self._model.create_voice_clone_prompt(
            ref_audio=str(self._reference_path),
            ref_text=self._reference_text,
        )
        print("[TTS/Qwen Clone] 克隆 prompt 已就绪", flush=True)

    def warmup(self) -> None:
        print("[TTS/Qwen Clone] 正在预热...", flush=True)
        self.synthesize("你好。")
        print("[TTS/Qwen Clone] 预热完成", flush=True)

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        del speaker_id

        normalized = normalize_tts_text(text)
        if not normalized:
            raise ValueError("text 不能为空")

        if seed is not None:
            torch.manual_seed(seed)
            np.random.seed(seed % (2**32 - 1))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        kwargs: dict[str, Any] = {}
        if self._generation:
            kwargs.update(self._generation)

        with torch.no_grad():
            wavs, sample_rate = self._model.generate_voice_clone(
                text=normalized,
                language=self._language,
                voice_clone_prompt=self._voice_clone_prompt,
                **kwargs,
            )

        audio = np.asarray(wavs[0], dtype=np.float32)
        if sample_rate != self._target_sr:
            target_len = max(1, int(len(audio) * self._target_sr / sample_rate))
            audio = resample(audio, target_len).astype(np.float32)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self._target_sr, format="WAV")
        return buffer.getvalue()

    @property
    def config_path(self) -> Path:
        return self._config_path

    @property
    def model_dir(self) -> Path:
        return self._model_dir

    @property
    def instruct(self) -> str:
        return self._settings.get("instruct", "").strip()

    @property
    def capabilities(self) -> EngineCapabilities:
        return EngineCapabilities(voice_forge=True, supports_corpus_cache=True)

    @property
    def clone_reference_path(self) -> Path:
        return self._reference_path


def create_engine(
    config_path: Path | None = None,
    *,
    use_clone: bool = False,
    force_regenerate_reference: bool = False,
    allow_reference_generate: bool = True,
) -> QwenVoiceDesignEngine | QwenCloneEngine:
    path = config_path or DEFAULT_CONFIG_PATH
    if use_clone:
        return QwenCloneEngine(
            path,
            force_regenerate_reference=force_regenerate_reference,
            allow_reference_generate=allow_reference_generate,
        )
    return QwenVoiceDesignEngine(path)
