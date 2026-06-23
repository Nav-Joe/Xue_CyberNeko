"""Bert-VITS2 推理封装。需要本机已克隆 Bert-VITS2 并安装依赖。"""

from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample

from engines.base import EngineCapabilities
from text_normalize import normalize_tts_text


class TtsEngine:
    def __init__(self, config_path: Path, model_path: Path, bert_vits2_root: Path) -> None:
        if not bert_vits2_root.is_dir():
            raise RuntimeError(
                f"未找到 Bert-VITS2 目录: {bert_vits2_root}\n"
                "请克隆 https://github.com/fishaudio/Bert-VITS2 并设置环境变量 BERT_VITS2_ROOT"
            )

        if not config_path.is_file():
            raise RuntimeError(f"未找到 config.json: {config_path}")

        if not model_path.is_file():
            raise RuntimeError(f"未找到模型权重: {model_path}")

        root = str(bert_vits2_root.resolve())
        if root not in sys.path:
            sys.path.insert(0, root)

        # 国内网络可自动走镜像；也可自行设置 HF_ENDPOINT
        os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

        os.chdir(root)

        import utils
        from infer import get_net_g, infer as bert_infer

        self._utils = utils
        self._bert_infer = bert_infer
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._use_fp16 = self._resolve_fp16(self._device)
        os.environ["TTS_FP16"] = "1" if self._use_fp16 else "0"
        self._hps = utils.get_hparams_from_file(str(config_path.resolve()))
        self._version = getattr(self._hps, "version", "2.3")
        self._net_g = get_net_g(str(model_path.resolve()), self._version, self._device, self._hps)
        if self._use_fp16:
            self._net_g.half()
        self._speaker_keys = list(self._hps.data.spk2id.keys())
        self._source_sr = int(self._hps.data.sampling_rate)
        self._target_sr = 22050

        print(
            f"[TTS] 模型已加载 version={self._version} device={self._device} "
            f"fp16={'on' if self._use_fp16 else 'off'} "
            f"speakers={self._speaker_keys} source_sr={self._source_sr}"
        )
        if self._device == "cpu":
            print("[TTS] 提示: 当前为 CPU 推理，FP16 仅在 NVIDIA GPU 上生效；安装 CUDA 版 PyTorch 后可自动加速")

    @staticmethod
    def _resolve_fp16(device: str) -> bool:
        if device != "cuda":
            return False
        flag = os.environ.get("TTS_FP16", "0").strip().lower()
        return flag not in ("0", "false", "no", "off")

    @property
    def capabilities(self) -> EngineCapabilities:
        return EngineCapabilities(voice_forge=False, supports_corpus_cache=True)

    @property
    def clone_reference_path(self) -> Path | None:
        return None

    def warmup(self) -> None:
        """启动时预加载 BERT、jieba 等，避免首次点击卡顿。"""
        print("[TTS] 正在预热 BERT 与推理管线...", flush=True)
        self.synthesize("你好")
        print("[TTS] 预热完成", flush=True)

    def _resolve_speaker(self, speaker_id: int) -> str:
        if not self._speaker_keys:
            raise RuntimeError("config.json 中 spk2id 为空")
        index = max(0, min(speaker_id, len(self._speaker_keys) - 1))
        return self._speaker_keys[index]

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        text = normalize_tts_text(text.strip())
        if not text:
            raise ValueError("text 不能为空")

        sid = self._resolve_speaker(speaker_id)

        if seed is not None:
            torch.manual_seed(seed)
            np.random.seed(seed % (2**32 - 1))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        with torch.no_grad():
            audio = self._bert_infer(
                text=text,
                emotion=0,
                sdp_ratio=0.2,
                noise_scale=0.6,
                noise_scale_w=0.8,
                length_scale=1.0,
                sid=sid,
                language="ZH",
                hps=self._hps,
                net_g=self._net_g,
                device=self._device,
            )

        audio = np.asarray(audio, dtype=np.float32)
        if self._source_sr != self._target_sr:
            target_len = max(1, int(len(audio) * self._target_sr / self._source_sr))
            audio = resample(audio, target_len).astype(np.float32)

        buffer = io.BytesIO()
        sf.write(buffer, audio, self._target_sr, format="WAV")
        return buffer.getvalue()


def create_engine(config_path: Path, model_path: Path, bert_vits2_root: Path) -> TtsEngine:
    return TtsEngine(config_path, model_path, bert_vits2_root)
