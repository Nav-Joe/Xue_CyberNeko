"""
Qwen attn 对拍：eager vs sdpa（同一句话、同一 VoiceDesign 模型）。

固定测试句：
  我是雪澜，一只可爱又活泼的猫娘喵，很高兴认识你~

用法（项目根目录）：
  .venv\\Scripts\\python.exe tts_voice\\tests\\bench_attn_sdpa_vs_eager.py

说明：
- 不纳入常规 pytest（文件名不以 test_ 开头），避免 CI/日常 npm run test:tts 加载 1.7B。
- 每种 attn：加载 → 1 次预热 → 3 次计时取平均（可改 RUNS）。
- 两次加载之间会卸模型并 empty_cache，降低显存顶满风险。
"""

from __future__ import annotations

import gc
import sys
import time
from pathlib import Path

import torch

# 保证以 -m 或直接脚本运行时都能找到 tts_voice
_TTS_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _TTS_ROOT.parent
if str(_TTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TTS_ROOT))
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from qwen_clone_setup import voice_design_model_dir  # noqa: E402
from qwen_model_load import load_qwen3_tts_model, prepare_torch_env  # noqa: E402
from text_normalize import normalize_tts_text  # noqa: E402
from voice_forge_config import load_merged_qwen_settings  # noqa: E402

BENCH_TEXT = "我是雪澜，一只可爱又活泼的猫娘喵，很高兴认识你~"
WARMUPS = 1
RUNS = 3
SEED = 42


def _unload(model: object) -> None:
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()


def _time_voice_design(attn: str) -> dict:
    settings = load_merged_qwen_settings(_TTS_ROOT / "qwen_config.json")
    model_dir = voice_design_model_dir(settings)
    if not model_dir.is_dir():
        raise FileNotFoundError(f"VoiceDesign 模型目录不存在: {model_dir}")

    device, dtype = prepare_torch_env()
    language = settings.get("language", "Chinese")
    instruct = str(settings.get("instruct", "")).strip()
    generation = dict(settings.get("generation") or {})
    text = normalize_tts_text(BENCH_TEXT)

    print(f"\n=== attn={attn} device={device} dtype={dtype} ===", flush=True)
    t_load0 = time.perf_counter()
    model, used_attn = load_qwen3_tts_model(
        model_dir,
        device=device,
        dtype=dtype,
        attn_implementation=attn,
    )
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    load_s = time.perf_counter() - t_load0
    print(f"load_s={load_s:.3f} used_attn={used_attn}", flush=True)

    def one_infer() -> float:
        torch.manual_seed(SEED)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(SEED)
            torch.cuda.synchronize()
        t0 = time.perf_counter()
        with torch.no_grad():
            wavs, sample_rate = model.generate_voice_design(
                text=text,
                language=language,
                instruct=instruct,
                non_streaming_mode=True,
                **generation,
            )
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        elapsed = time.perf_counter() - t0
        audio = wavs[0]
        n = len(audio) if hasattr(audio, "__len__") else 0
        return elapsed, float(sample_rate), int(n)

    for i in range(WARMUPS):
        elapsed, sr, n = one_infer()
        print(f"warmup[{i}] {elapsed:.3f}s sr={sr} samples={n}", flush=True)

    times: list[float] = []
    last_sr = 0.0
    last_n = 0
    for i in range(RUNS):
        elapsed, sr, n = one_infer()
        times.append(elapsed)
        last_sr, last_n = sr, n
        print(f"run[{i}] {elapsed:.3f}s", flush=True)

    _unload(model)
    avg = sum(times) / len(times)
    audio_dur = (last_n / last_sr) if last_sr > 0 else 0.0
    rtf = (avg / audio_dur) if audio_dur > 0 else float("nan")
    return {
        "requested_attn": attn,
        "used_attn": used_attn,
        "load_s": load_s,
        "runs_s": times,
        "avg_s": avg,
        "audio_s": audio_dur,
        "rtf": rtf,
        "device": device,
    }


def main() -> int:
    print("Qwen attn bench: eager vs sdpa", flush=True)
    print(f"text={BENCH_TEXT!r}", flush=True)
    print(f"warmups={WARMUPS} runs={RUNS} seed={SEED}", flush=True)

    eager = _time_voice_design("eager")
    sdpa = _time_voice_design("sdpa")

    speedup = eager["avg_s"] / sdpa["avg_s"] if sdpa["avg_s"] > 0 else float("nan")
    saved = eager["avg_s"] - sdpa["avg_s"]
    pct = (1.0 - sdpa["avg_s"] / eager["avg_s"]) * 100.0 if eager["avg_s"] > 0 else float("nan")

    print("\n========== SUMMARY ==========", flush=True)
    print(
        f"eager: used={eager['used_attn']} load={eager['load_s']:.3f}s "
        f"avg={eager['avg_s']:.3f}s rtf={eager['rtf']:.3f} runs={eager['runs_s']}",
        flush=True,
    )
    print(
        f"sdpa:  used={sdpa['used_attn']} load={sdpa['load_s']:.3f}s "
        f"avg={sdpa['avg_s']:.3f}s rtf={sdpa['rtf']:.3f} runs={sdpa['runs_s']}",
        flush=True,
    )
    print(
        f"same-sentence speedup (eager/sdpa)={speedup:.3f}x  "
        f"saved={saved:.3f}s  ({pct:.1f}% faster if >0)",
        flush=True,
    )
    print("=============================", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
