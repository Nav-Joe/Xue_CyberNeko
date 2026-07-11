"""测试 Qwen3 TTS /tts 是否真正并发处理（对比并发 vs 串行总耗时与请求重叠）。"""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

TTS_URL = "http://127.0.0.1:8000/tts"
TEXTS = ["嗨！", "你是谁呀？", "我是雪澜哦！", "今天天气不错。", "再见！"]


@dataclass
class ReqResult:
    index: int
    text: str
    ok: bool
    start: float
    end: float
    bytes_len: int
    error: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


def post_tts(index: int, text: str, *, release: threading.Barrier | None = None) -> ReqResult:
    if release is not None:
        release.wait()

    body = json.dumps({"text": text, "speaker_id": 0}).encode("utf-8")
    req = urllib.request.Request(
        TTS_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            wav = resp.read()
        end = time.perf_counter()
        return ReqResult(index, text, True, start, end, len(wav))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        end = time.perf_counter()
        return ReqResult(index, text, False, start, end, 0, f"HTTP {err.code}: {detail[:200]}")
    except Exception as err:  # noqa: BLE001
        end = time.perf_counter()
        return ReqResult(index, text, False, start, end, 0, str(err))


def run_concurrent(count: int) -> tuple[list[ReqResult], float]:
    barrier = threading.Barrier(count)
    results: list[ReqResult | None] = [None] * count
    threads: list[threading.Thread] = []

    def worker(i: int) -> None:
        results[i] = post_tts(i, TEXTS[i], release=barrier)

    wall_start = time.perf_counter()
    for i in range(count):
        thread = threading.Thread(target=worker, args=(i,), name=f"tts-req-{i}")
        threads.append(thread)
        thread.start()
    for thread in threads:
        thread.join()
    wall_end = time.perf_counter()
    return [r for r in results if r is not None], wall_end - wall_start


def run_sequential(count: int) -> tuple[list[ReqResult], float]:
    wall_start = time.perf_counter()
    results = [post_tts(i, TEXTS[i]) for i in range(count)]
    wall_end = time.perf_counter()
    return results, wall_end - wall_start


def overlap_ratio(results: list[ReqResult]) -> float:
    if len(results) < 2:
        return 0.0
    windows = [(r.start, r.end) for r in results]
    overlap_ms = 0.0
    for i, (a0, a1) in enumerate(windows):
        for b0, b1 in windows[i + 1 :]:
            overlap_ms += max(0.0, min(a1, b1) - max(a0, b0))
    span = max(r.end for r in results) - min(r.start for r in results)
    if span <= 0:
        return 0.0
    return overlap_ms / span


def print_block(title: str, results: list[ReqResult], wall: float) -> None:
    print(f"\n=== {title} ===")
    for r in sorted(results, key=lambda x: x.index):
        status = "OK" if r.ok else f"FAIL ({r.error})"
        print(
            f"  #{r.index + 1} [{r.text}] {status} "
            f"dur={r.duration:.2f}s bytes={r.bytes_len} "
            f"start+{r.start - results[0].start:.2f}s"
        )
    durs = [r.duration for r in results if r.ok]
    print(f"  wall={wall:.2f}s  sum(dur)={sum(durs):.2f}s  max(dur)={max(durs) if durs else 0:.2f}s")
    print(f"  overlap_ratio={overlap_ratio(results):.2f}  (1.0=完全重叠并发, 0=完全串行)")


def main() -> int:
    count = min(5, len(TEXTS))
    print(f"TTS endpoint: {TTS_URL}")
    print(f"Request count: {count}")

    try:
        health_req = urllib.request.Request("http://127.0.0.1:8000/health", method="GET")
        with urllib.request.urlopen(health_req, timeout=5) as resp:
            health = json.loads(resp.read().decode("utf-8"))
        print(
            f"Health: backend={health.get('backend')} ready={health.get('ready')} "
            f"engine={health.get('engine')}"
        )
    except Exception as err:  # noqa: BLE001
        print(f"Health check failed: {err}")
        return 1

    seq_results, seq_wall = run_sequential(count)
    if not all(r.ok for r in seq_results):
        print_block("Sequential (FAILED)", seq_results, seq_wall)
        return 1

    conc_results, conc_wall = run_concurrent(count)
    print_block("Sequential", seq_results, seq_wall)
    print_block("Concurrent", conc_results, conc_wall)

    seq_sum = sum(r.duration for r in seq_results if r.ok)
    print("\n=== Conclusion ===")
    conc_max = max((r.duration for r in conc_results if r.ok), default=0.0)
    seq_max = max((r.duration for r in seq_results if r.ok), default=0.0)
    speedup = seq_wall / conc_wall if conc_wall > 0 else 0.0

    if conc_wall <= conc_max * 1.25:
        verdict = (
            "CONCURRENT_HTTP — 多路请求同时处理，总墙钟接近最慢单路；"
            "但单路耗时会因 GPU 争抢而变长"
        )
    elif conc_wall >= seq_sum * 0.85:
        verdict = "SERIALIZED_GPU — 并发总耗时接近串行之和，GPU 基本排队"
    else:
        verdict = "PARTIAL — 有并发重叠，但整体吞吐提升有限"

    print(f"  single max dur (sequential run): {seq_max:.2f}s")
    print(f"  concurrent max dur: {conc_max:.2f}s")
    print(f"  speedup (seq_wall/conc_wall): {speedup:.2f}x")
    print(f"  verdict: {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
