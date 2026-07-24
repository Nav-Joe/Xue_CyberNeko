"""
PoC：non_streaming_mode True vs False（不改生产默认，仅本机对拍）。

官方说明：False 只是「模拟流式文本输入」，不是边生成边吐 WAV。
本脚本验证：同句墙钟 / RTF 有没有提升。

固定句：
  我是雪澜，一只可爱又活泼的猫娘喵，很高兴认识你~

用法（项目根，不动 qwen_config / qwen_engine 默认）：
  .venv\\Scripts\\python.exe tts_voice\\tests\\bench_non_streaming_mode.py
"""

from __future__ import annotations

import gc
import sys
import time
from pathlib import Path

import torch

_TTS_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _TTS_ROOT.parent
if str(_TTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TTS_ROOT))
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from qwen_clone_setup import voice_design_model_dir  # noqa: E402
from qwen_model_load import load_qwen3_tts_model, prepare_torch_env, resolve_attn_implementation  # noqa: E402
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


def _time_mode(model, *, settings: dict, non_streaming_mode: bool) -> dict:
    language = settings.get("language", "Chinese")
    instruct = str(settings.get("instruct", "")).strip()
    generation = dict(settings.get("generation") or {})
    text = normalize_tts_text(BENCH_TEXT)

    label = f"non_streaming_mode={non_streaming_mode}"
    print(f"\n=== {label} ===", flush=True)

    def one_infer() -> tuple[float, float, int]:
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
                non_streaming_mode=non_streaming_mode,
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
        print(f"run[{i}] {elapsed:.3f}s samples={n}", flush=True)

    avg = sum(times) / len(times)
    audio_dur = (last_n / last_sr) if last_sr > 0 else 0.0
    rtf = (avg / audio_dur) if audio_dur > 0 else float("nan")
    return {
        "non_streaming_mode": non_streaming_mode,
        "runs_s": times,
        "avg_s": avg,
        "audio_s": audio_dur,
        "rtf": rtf,
        "last_samples": last_n,
    }


def main() -> int:
    settings = load_merged_qwen_settings(_TTS_ROOT / "qwen_config.json")
    model_dir = voice_design_model_dir(settings)
    if not model_dir.is_dir():
        raise FileNotFoundError(f"VoiceDesign 模型目录不存在: {model_dir}")

    device, dtype = prepare_torch_env()
    attn = resolve_attn_implementation(settings)

    print("Qwen PoC bench: non_streaming_mode True vs False", flush=True)
    print(f"text={BENCH_TEXT!r}", flush=True)
    print(f"device={device} dtype={dtype} attn={attn}", flush=True)
    print(f"warmups={WARMUPS} runs={RUNS} seed={SEED}", flush=True)
    print("(生产默认不改；本脚本仅对拍)", flush=True)

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

    # 同一模型实例上先后测两种模式，排除二次加载干扰
    true_stats = _time_mode(model, settings=settings, non_streaming_mode=True)
    false_stats = _time_mode(model, settings=settings, non_streaming_mode=False)
    _unload(model)

    speedup = true_stats["avg_s"] / false_stats["avg_s"] if false_stats["avg_s"] > 0 else float("nan")
    saved = true_stats["avg_s"] - false_stats["avg_s"]
    pct = (
        (1.0 - false_stats["avg_s"] / true_stats["avg_s"]) * 100.0
        if true_stats["avg_s"] > 0
        else float("nan")
    )

    print("\n========== SUMMARY ==========", flush=True)
    print(
        f"True:  avg={true_stats['avg_s']:.3f}s rtf={true_stats['rtf']:.3f} "
        f"audio≈{true_stats['audio_s']:.3f}s runs={true_stats['runs_s']}",
        flush=True,
    )
    print(
        f"False: avg={false_stats['avg_s']:.3f}s rtf={false_stats['rtf']:.3f} "
        f"audio≈{false_stats['audio_s']:.3f}s runs={false_stats['runs_s']}",
        flush=True,
    )
    print(
        f"wall speedup (True/False)={speedup:.3f}x  saved={saved:.3f}s  ({pct:.1f}% if >0 means False faster)",
        flush=True,
    )
    print(
        "Note: False ≠ streaming WAV; API still returns full audio after generate finishes.",
        flush=True,
    )
    print("=============================", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
