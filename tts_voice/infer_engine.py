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

        os.chdir(root)

        import utils
        from infer import get_net_g, infer as bert_infer

        self._utils = utils
        self._bert_infer = bert_infer
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._hps = utils.get_hparams_from_file(str(config_path.resolve()))
        self._version = getattr(self._hps, "version", "2.3")
        self._net_g = get_net_g(str(model_path.resolve()), self._version, self._device, self._hps)
        self._speaker_keys = list(self._hps.data.spk2id.keys())
        self._source_sr = int(self._hps.data.sampling_rate)
        self._target_sr = 22050

        print(
            f"[TTS] 模型已加载 version={self._version} device={self._device} "
            f"speakers={self._speaker_keys} source_sr={self._source_sr}"
        )

    def _resolve_speaker(self, speaker_id: int) -> str:
        if not self._speaker_keys:
            raise RuntimeError("config.json 中 spk2id 为空")
        index = max(0, min(speaker_id, len(self._speaker_keys) - 1))
        return self._speaker_keys[index]

    def synthesize(self, text: str, speaker_id: int = 0) -> bytes:
        text = text.strip()
        if not text:
            raise ValueError("text 不能为空")

        sid = self._resolve_speaker(speaker_id)

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
