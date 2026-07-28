#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""聊天 TTS 调度算法破圈测试：离散事件模拟 + 可选 live 校准。

评分（越低越好）::
    score = total_wall_s + GAP_WEIGHT * sum_inter_sentence_gaps_s

其中 sum_inter_sentence_gaps = Σ max(0, reveal[i] - play_end[i-1])，空档权重更大。

用法::
    python scripts/benchmark_chat_tts_scheduling.py
    python scripts/benchmark_chat_tts_scheduling.py --calibrate   # 用本地 TTS 拟合参数
    python scripts/benchmark_chat_tts_scheduling.py --gap-weight 4
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Literal

GAP_WEIGHT_DEFAULT = 3.0
WINDOW_MAX = 5

AlgoName = Literal[
    "serial_ordered_window",  # 当前：滑动窗口 + GPU 严格按序串行
    "batch_window",  # 每窗最多 5 句一次 synthesize_batch
    "first_single_rest_batch",  # 旧：首句单独 + 后续 batch-5
    "parallel_pool_2",  # 有限并发：2 路 GPU + 按序释放
    "parallel_pool_3",
    "parallel_pool_5",  # 理想上限（单卡 rarely 可达）
]


@dataclass(frozen=True)
class TimingParams:
    """从字符数估算 synth / play 耗时（秒）。"""

    synth_base_s: float = 0.35
    synth_per_char_s: float = 0.012
    play_per_char_s: float = 0.075
    batch_overhead_s: float = 0.25
    batch_char_factor: float = 0.62  # batch 相对单句逐字耗时的倍率（<1 表示 batch 更省）

    def synth_one(self, chars: int) -> float:
        return self.synth_base_s + self.synth_per_char_s * max(chars, 1)

    def play_one(self, chars: int) -> float:
        return self.play_per_char_s * max(chars, 1)

    def synth_batch(self, char_counts: list[int]) -> float:
        total_chars = sum(max(c, 1) for c in char_counts)
        single_sum = sum(self.synth_one(c) for c in char_counts)
        batched = self.batch_overhead_s + self.synth_per_char_s * total_chars * self.batch_char_factor
        return min(single_sum, max(batched, self.synth_one(char_counts[0] if char_counts else 1)))


@dataclass
class SegmentTrace:
    index: int
    chars: int
    synth_ready_s: float
    reveal_s: float
    play_end_s: float


@dataclass
class SimResult:
    name: str
    total_wall_s: float
    sum_gap_s: float
    max_gap_s: float
    time_to_first_reveal_s: float
    score: float
    traces: list[SegmentTrace] = field(default_factory=list)

    def format_row(self) -> str:
        return (
            f"{self.name:28}  wall={self.total_wall_s:6.2f}s  "
            f"gaps={self.sum_gap_s:6.2f}s  max_gap={self.max_gap_s:5.2f}s  "
            f"1st={self.time_to_first_reveal_s:5.2f}s  score={self.score:7.2f}"
        )


def _char_counts(texts: list[str]) -> list[int]:
    return [len(t.strip()) for t in texts if t.strip()]


def _score(total_wall: float, gaps: list[float], gap_weight: float) -> tuple[float, float, float]:
    sum_gap = sum(gaps)
    max_gap = max(gaps) if gaps else 0.0
    return total_wall + gap_weight * sum_gap, sum_gap, max_gap


def _simulate_release_play(
    name: str,
    texts: list[str],
    synth_ready: list[float],
    params: TimingParams,
    gap_weight: float,
) -> SimResult:
    """按序释放：队头就绪则 reveal + 播放；统计句间空档。"""
    chars = _char_counts(texts)
    n = len(chars)
    if n == 0:
        return SimResult(name, 0.0, 0.0, 0.0, 0.0, 0.0)

    reveal = [0.0] * n
    play_end = [0.0] * n
    gaps: list[float] = []
    clock = 0.0

    for i in range(n):
        ready = synth_ready[i]
        if i == 0:
            reveal[i] = ready
        else:
            gap = max(0.0, ready - play_end[i - 1])
            gaps.append(gap)
            reveal[i] = max(ready, play_end[i - 1])
        play_end[i] = reveal[i] + params.play_one(chars[i])
        clock = play_end[i]

    score, sum_gap, max_gap = _score(clock, gaps, gap_weight)
    traces = [
        SegmentTrace(i, chars[i], synth_ready[i], reveal[i], play_end[i]) for i in range(n)
    ]
    return SimResult(
        name=name,
        total_wall_s=clock,
        sum_gap_s=sum_gap,
        max_gap_s=max_gap,
        time_to_first_reveal_s=reveal[0],
        score=score,
        traces=traces,
    )


def simulate_serial_ordered_window(texts: list[str], params: TimingParams, gap_weight: float) -> SimResult:
    """当前实现：GPU 0→1→2 串行；滑动窗口仅限制 in-flight 提交，不改变 GPU 顺序。"""
    chars = _char_counts(texts)
    n = len(chars)
    synth_ready = [0.0] * n
    gpu_free = 0.0
    for i in range(n):
        gpu_free += params.synth_one(chars[i])
        synth_ready[i] = gpu_free
    return _simulate_release_play("serial_ordered_window", texts, synth_ready, params, gap_weight)


def simulate_serial_with_play_overlap(texts: list[str], params: TimingParams, gap_weight: float) -> SimResult:
    """串行 GPU，但在播放第 i 句时开始推理第 i+1 句（流水线）。"""
    chars = _char_counts(texts)
    n = len(chars)
    if n == 0:
        return SimResult("serial_with_play_overlap", 0.0, 0.0, 0.0, 0.0, 0.0)

    synth_ready = [0.0] * n
    reveal = [0.0] * n
    play_end = [0.0] * n
    gaps: list[float] = []
    gpu_free = 0.0

    for i in range(n):
        not_before = play_end[i - 1] if i > 0 else 0.0
        start = max(gpu_free, not_before)
        synth_ready[i] = start + params.synth_one(chars[i])
        gpu_free = synth_ready[i]

        if i == 0:
            reveal[i] = synth_ready[i]
        else:
            gaps.append(max(0.0, synth_ready[i] - play_end[i - 1]))
            reveal[i] = max(synth_ready[i], play_end[i - 1])
        play_end[i] = reveal[i] + params.play_one(chars[i])

    score, sum_gap, max_gap = _score(play_end[n - 1], gaps, gap_weight)
    return SimResult(
        name="serial_with_play_overlap",
        total_wall_s=play_end[n - 1],
        sum_gap_s=sum_gap,
        max_gap_s=max_gap,
        time_to_first_reveal_s=reveal[0],
        score=score,
    )


def simulate_batch_window(texts: list[str], params: TimingParams, gap_weight: float) -> SimResult:
    """每满 5 句（或剩余）走一次 batch GPU；窗内同时完成。"""
    chars = _char_counts(texts)
    n = len(chars)
    synth_ready = [0.0] * n
    gpu_free = 0.0
    i = 0
    while i < n:
        batch = chars[i : i + WINDOW_MAX]
        dur = params.synth_batch(batch)
        ready = gpu_free + dur
        for j in range(len(batch)):
            synth_ready[i + j] = ready
        gpu_free = ready
        i += len(batch)

    return _simulate_release_play("batch_window", texts, synth_ready, params, gap_weight)


def simulate_first_single_rest_batch(texts: list[str], params: TimingParams, gap_weight: float) -> SimResult:
    chars = _char_counts(texts)
    n = len(chars)
    synth_ready = [0.0] * n
    gpu_free = 0.0
    if n >= 1:
        gpu_free += params.synth_one(chars[0])
        synth_ready[0] = gpu_free
    i = 1
    while i < n:
        batch = chars[i : i + WINDOW_MAX]
        dur = params.synth_batch(batch)
        gpu_free += dur
        for j in range(len(batch)):
            synth_ready[i + j] = gpu_free
        i += len(batch)

    return _simulate_release_play("first_single_rest_batch", texts, synth_ready, params, gap_weight)


def simulate_parallel_pool(
    texts: list[str],
    params: TimingParams,
    gap_weight: float,
    pool_size: int,
    name: str,
) -> SimResult:
    """有限并发：最多 pool_size 路 synth 并行 + 滑动窗口 + 严格按序释放。"""
    chars = _char_counts(texts)
    n = len(chars)
    if n == 0:
        return SimResult(name, 0.0, 0.0, 0.0, 0.0, 0.0)

    synth_ready = [math.inf] * n
    worker_free = [0.0] * pool_size
    submitted = 0
    released = 0
    reveal = [0.0] * n
    play_end = [0.0] * n
    gaps: list[float] = []

    def submit_available() -> bool:
        return submitted < n and submitted - released < WINDOW_MAX

    def assign_synth(idx: int, not_before: float) -> None:
        w = min(range(pool_size), key=lambda k: worker_free[k])
        start = max(not_before, worker_free[w])
        synth_ready[idx] = start + params.synth_one(chars[idx])
        worker_free[w] = synth_ready[idx]

    while released < n:
        while submit_available():
            assign_synth(submitted, 0.0)
            submitted += 1

        if synth_ready[released] is math.inf:
            break

        if released == 0:
            reveal[released] = synth_ready[released]
        else:
            gap = max(0.0, synth_ready[released] - play_end[released - 1])
            gaps.append(gap)
            reveal[released] = max(synth_ready[released], play_end[released - 1])
        play_end[released] = reveal[released] + params.play_one(chars[released])
        released += 1

    score, sum_gap, max_gap = _score(play_end[n - 1], gaps, gap_weight)
    traces = [
        SegmentTrace(i, chars[i], synth_ready[i], reveal[i], play_end[i]) for i in range(n)
    ]
    return SimResult(
        name=name,
        total_wall_s=play_end[n - 1],
        sum_gap_s=sum_gap,
        max_gap_s=max_gap,
        time_to_first_reveal_s=reveal[0],
        score=score,
        traces=traces,
    )


def simulate_hybrid_batch_parallel_release(
    texts: list[str],
    params: TimingParams,
    gap_weight: float,
) -> SimResult:
    """混合候选：GPU batch-5 推理，但按序释放（batch 内同时就绪）。"""
    return simulate_batch_window(texts, params, gap_weight)


CORPORA: dict[str, list[str]] = {
    "user_6_sentences": [
        "你好！",
        "我是雪澜！",
        "一只可爱的猫娘！",
        "很高兴见到你呀！",
        "你是谁呀？",
        "怎么称呼？",
    ],
    "one_long_many_short": [
        "这是一段很长很长的开场白，需要花不少时间才能合成完毕。",
        "嗯。",
        "好的。",
        "知道了。",
        "谢谢。",
        "再见。",
    ],
    "medium_chat_8": [
        "今天天气真不错呢。",
        "要不要一起出去走走？",
        "我知道附近有家很好喝的奶茶店。",
        "你要喝什么口味的？",
        "我推荐试试草莓多多。",
        "不过抹茶也不错哦。",
        "你决定就好啦。",
        "我在门口等你。",
    ],
}


def run_all_simulations(params: TimingParams, gap_weight: float) -> dict[str, list[SimResult]]:
    algos: list[Callable[[list[str], TimingParams, float], SimResult]] = [
        simulate_serial_ordered_window,
        simulate_serial_with_play_overlap,
        simulate_batch_window,
        simulate_first_single_rest_batch,
        lambda t, p, g: simulate_parallel_pool(t, p, g, 2, "parallel_pool_2"),
        lambda t, p, g: simulate_parallel_pool(t, p, g, 3, "parallel_pool_3"),
        lambda t, p, g: simulate_parallel_pool(t, p, g, 5, "parallel_pool_5"),
    ]
    out: dict[str, list[SimResult]] = {}
    for corpus_name, texts in CORPORA.items():
        results = [fn(texts, params, gap_weight) for fn in algos]
        results.sort(key=lambda r: r.score)
        out[corpus_name] = results
    return out


def calibrate_from_live_tts(base_url: str = "http://127.0.0.1:8000") -> TimingParams:
    """用 live /tts 单句与 /tts/batch 拟合 TimingParams（需 TTS 已启动）。"""
    samples = ["嗨！", "今天天气真不错呢。", "这是一段稍长的测试句子，用来估算每字耗时。"]
    batch_samples = samples[:3]

    def post_json(path: str, payload: dict) -> tuple[float, int]:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{base_url}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        import time

        t0 = time.perf_counter()
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = resp.read()
        return time.perf_counter() - t0, len(data)

    singles: list[tuple[int, float]] = []
    for text in samples:
        dur, _ = post_json("/tts", {"text": text, "speaker_id": 0, "mode": "chat", "order": 0})
        singles.append((len(text), dur))

    batch_dur, _ = post_json(
        "/tts/batch",
        {"texts": batch_samples, "speaker_id": 0},
    )
    batch_chars = sum(len(t) for t in batch_samples)
    single_sum = sum(d for _, d in singles)

    # 线性回归 synth ≈ base + k*chars
    n = len(singles)
    sum_c = sum(c for c, _ in singles)
    sum_d = sum(d for _, d in singles)
    sum_cc = sum(c * c for c, _ in singles)
    sum_cd = sum(c * d for c, d in singles)
    denom = n * sum_cc - sum_c * sum_c
    k = (n * sum_cd - sum_c * sum_d) / denom if denom else 0.012
    base = (sum_d - k * sum_c) / n

    batch_factor = (batch_dur - base) / (k * batch_chars) if batch_chars and k else 0.62
    batch_factor = max(0.35, min(1.0, batch_factor))

    return TimingParams(
        synth_base_s=max(0.1, base),
        synth_per_char_s=max(0.001, k),
        play_per_char_s=0.075,
        batch_overhead_s=max(0.1, base * 0.7),
        batch_char_factor=batch_factor,
    )


def print_report(all_results: dict[str, list[SimResult]], gap_weight: float, params: TimingParams) -> None:
    print("=" * 72)
    print("聊天 TTS 调度算法破圈测试（离散事件模拟）")
    print("=" * 72)
    print(f"评分 = total_wall + {gap_weight} * sum_gaps  （越低越好，空档权重更大）")
    print(
        f"TimingParams: synth={params.synth_base_s:.2f}+{params.synth_per_char_s:.4f}*chars  "
        f"play={params.play_per_char_s:.3f}*chars  batch_factor={params.batch_char_factor:.2f}"
    )
    print()

    aggregate: dict[str, list[float]] = {}

    for corpus_name, results in all_results.items():
        print(f"--- 语料: {corpus_name} ({len(CORPORA[corpus_name])} 句) ---")
        for rank, r in enumerate(results, 1):
            print(f"  #{rank} {r.format_row()}")
            aggregate.setdefault(r.name, []).append(r.score)
        best = results[0]
        print(f"  → 推荐: {best.name} (score={best.score:.2f})")
        print()

    print("--- 跨语料平均 score（越低越好）---")
    ranking = sorted(
        ((name, sum(scores) / len(scores)) for name, scores in aggregate.items()),
        key=lambda x: x[1],
    )
    for rank, (name, avg) in enumerate(ranking, 1):
        marker = " <- current" if name == "serial_ordered_window" else ""
        print(f"  #{rank} {name:28}  avg_score={avg:.2f}{marker}")

    winner = ranking[0][0]
    print()
    print("=" * 72)
    print("结论（基于模拟，live 环境请 --calibrate 后重跑）")
    print("=" * 72)
    if winner.startswith("parallel_pool"):
        print(
            f"- 综合最优倾向 **{winner}**（有限并发 + 按序释放）。\n"
            "- 消费级单卡建议先试 parallel_pool_2 或 _3，勿默认 _5。\n"
            "- 总墙钟通常优于纯串行，句间空档明显缩短（后续句可提前推理完）。"
        )
    elif winner == "batch_window":
        print(
            "- 综合最优倾向 **batch_window**（GPU batch-5 + 按序播放）。\n"
            "- 总推理时间最短，但首句前等待整批 batch，空档可能不如有限并行。"
        )
    elif winner == "serial_ordered_window":
        print(
            "- 在当前参数下 **serial_ordered_window** 仍最优或接近最优。\n"
            "- 若 live 校准后 parallel_pool_2/3 领先，再考虑升级后端并发。"
        )
    else:
        print(f"- 综合最优: **{winner}**，请结合上表与 --calibrate 结果决策。")


def main() -> int:
    parser = argparse.ArgumentParser(description="Chat TTS scheduling benchmark")
    parser.add_argument("--gap-weight", type=float, default=GAP_WEIGHT_DEFAULT)
    parser.add_argument("--calibrate", action="store_true", help="从本地 TTS 服务拟合 TimingParams")
    parser.add_argument("--tts-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    params = TimingParams()
    if args.calibrate:
        try:
            params = calibrate_from_live_tts(args.tts_url.rstrip("/"))
            print(f"Calibrated: {params}\n")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            print(f"校准失败（TTS 未启动？）: {err}", file=sys.stderr)
            print("使用默认 TimingParams 继续模拟。\n")

    all_results = run_all_simulations(params, args.gap_weight)
    print_report(all_results, args.gap_weight, params)
    return 0


if __name__ == "__main__":
    sys.exit(main())
