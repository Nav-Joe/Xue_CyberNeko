"""Qwen3-TTS 推理封装：精选模式 VoiceDesign；自定义语料模式 VoiceDesign 参考音 + Base 克隆。"""

from __future__ import annotations

import io
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
from qwen_model_load import load_qwen3_tts_model, prepare_torch_env, resolve_attn_implementation
from text_normalize import normalize_tts_text
from voice_forge_config import load_merged_qwen_settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "qwen_config.json"


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
        self._device, self._dtype = prepare_torch_env()
        attn = resolve_attn_implementation(self._settings)

        print(
            f"[TTS/Qwen] 正在加载 VoiceDesign 模型...\n"
            f"           path={self._model_dir}\n"
            f"           device={self._device}\n"
            f"           attn={attn}",
            flush=True,
        )
        self._model, self._attn_implementation = load_qwen3_tts_model(
            self._model_dir,
            device=self._device,
            dtype=self._dtype,
            attn_implementation=attn,
        )
        if self._attn_implementation != attn:
            print(f"[TTS/Qwen] 实际 attn={self._attn_implementation}", flush=True)
        print(f"[TTS/Qwen] instruct={self._instruct[:48]}...", flush=True)

    @staticmethod
    def _load_settings(config_path: Path) -> dict:
        return load_merged_qwen_settings(config_path)

    def warmup(self) -> None:
        print("[TTS/Qwen] 正在预热...", flush=True)
        self.synthesize("你好。")
        print("[TTS/Qwen] 预热完成", flush=True)

    def _apply_seed(self, seed: int | None) -> None:
        if seed is None:
            return
        torch.manual_seed(seed)
        np.random.seed(seed % (2**32 - 1))
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    def _encode_wav(self, wav: np.ndarray, sample_rate: int) -> bytes:
        audio = np.asarray(wav, dtype=np.float32)
        if sample_rate != self._target_sr:
            target_len = max(1, int(len(audio) * self._target_sr / sample_rate))
            audio = resample(audio, target_len).astype(np.float32)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self._target_sr, format="WAV")
        return buffer.getvalue()

    def synthesize_batch(
        self,
        texts: list[str],
        speaker_id: int = 0,
        seed: int | None = None,
    ) -> list[bytes]:
        del speaker_id

        normalized = [normalize_tts_text(text) for text in texts]
        if not normalized:
            return []
        if any(not piece for piece in normalized):
            raise ValueError("batch 中存在空 text")

        self._apply_seed(seed)

        with torch.no_grad():
            wavs, sample_rate = self._model.generate_voice_design(
                text=normalized,
                language=[self._language] * len(normalized),
                instruct=[self._instruct] * len(normalized),
                non_streaming_mode=True,
                **self._generation,
            )

        return [self._encode_wav(wav, sample_rate) for wav in wavs]

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        del speaker_id

        normalized = normalize_tts_text(text)
        if not normalized:
            raise ValueError("text 不能为空")

        return self.synthesize_batch([normalized], seed=seed)[0]

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
        self._device, self._dtype = prepare_torch_env()

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
        attn = resolve_attn_implementation(self._settings)

        print(
            f"[TTS/Qwen Clone] 正在加载 Base 克隆模型...\n"
            f"                 path={self._model_dir}\n"
            f"                 ref={self._reference_path}\n"
            f"                 attn={attn}",
            flush=True,
        )
        self._model, self._attn_implementation = load_qwen3_tts_model(
            self._model_dir,
            device=self._device,
            dtype=self._dtype,
            attn_implementation=attn,
        )
        if self._attn_implementation != attn:
            print(f"[TTS/Qwen Clone] 实际 attn={self._attn_implementation}", flush=True)
        self._voice_clone_prompt = self._model.create_voice_clone_prompt(
            ref_audio=str(self._reference_path),
            ref_text=self._reference_text,
        )
        print("[TTS/Qwen Clone] 克隆 prompt 已就绪", flush=True)

    def warmup(self) -> None:
        print("[TTS/Qwen Clone] 正在预热...", flush=True)
        self.synthesize("你好。")
        print("[TTS/Qwen Clone] 预热完成", flush=True)

    def _apply_seed(self, seed: int | None) -> None:
        if seed is None:
            return
        torch.manual_seed(seed)
        np.random.seed(seed % (2**32 - 1))
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    def _encode_wav(self, wav: np.ndarray, sample_rate: int) -> bytes:
        audio = np.asarray(wav, dtype=np.float32)
        if sample_rate != self._target_sr:
            target_len = max(1, int(len(audio) * self._target_sr / sample_rate))
            audio = resample(audio, target_len).astype(np.float32)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self._target_sr, format="WAV")
        return buffer.getvalue()

    def synthesize_batch(
        self,
        texts: list[str],
        speaker_id: int = 0,
        seed: int | None = None,
    ) -> list[bytes]:
        del speaker_id

        normalized = [normalize_tts_text(text) for text in texts]
        if not normalized:
            return []
        if any(not piece for piece in normalized):
            raise ValueError("batch 中存在空 text")

        self._apply_seed(seed)

        kwargs: dict[str, Any] = {"non_streaming_mode": True}
        if self._generation:
            kwargs.update(self._generation)

        with torch.no_grad():
            wavs, sample_rate = self._model.generate_voice_clone(
                text=normalized,
                language=[self._language] * len(normalized),
                voice_clone_prompt=self._voice_clone_prompt,
                **kwargs,
            )

        return [self._encode_wav(wav, sample_rate) for wav in wavs]

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        del speaker_id

        normalized = normalize_tts_text(text)
        if not normalized:
            raise ValueError("text 不能为空")

        return self.synthesize_batch([normalized], seed=seed)[0]

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
