"""Qwen / 通用 TTS 批量推理调度：单 worker，显式 batch + micro-batch（最多 5）。"""

from __future__ import annotations

import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Any

MAX_BATCH_SIZE = 5
MAX_WAIT_MS = 150
SYNTH_TIMEOUT_S = 300.0

GroupKey = tuple[int, int, int | None]


@dataclass
class _Pending:
    engine: Any
    text: str
    speaker_id: int
    seed: int | None
    order: int | None = None
    enqueued_at: float = field(default_factory=time.monotonic)
    event: threading.Event = field(default_factory=threading.Event)
    result: bytes | None = None
    error: BaseException | None = None


def _group_key(item: _Pending) -> GroupKey:
    return (id(item.engine), item.speaker_id, item.seed)


class BatchInferenceDispatcher:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: list[_Pending] = []
        self._immediate: list[_Pending] = []
        self._chat_order_buffer: dict[int, _Pending] = {}
        self._chat_order_next: int = 0
        self._priority_batches: list[list[_Pending]] = []
        self._wake = threading.Event()
        self._worker = threading.Thread(
            target=self._worker_loop,
            name="tts-batch-inference",
            daemon=True,
        )
        self._worker.start()

    def synthesize(
        self,
        engine: Any,
        text: str,
        speaker_id: int = 0,
        seed: int | None = None,
    ) -> bytes:
        return self.synthesize_batch(engine, [text], speaker_id=speaker_id, seed=seed)[0]

    def synthesize_immediate(
        self,
        engine: Any,
        text: str,
        speaker_id: int = 0,
        seed: int | None = None,
        order: int | None = None,
    ) -> bytes:
        """聊天滑动窗口：单句入队；带 order 时严格按序号推理（HTTP 乱序到达也先 0 后 1…）。"""
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("text 不能为空")

        item = _Pending(
            engine=engine,
            text=cleaned,
            speaker_id=speaker_id,
            seed=seed,
            order=order,
        )
        with self._lock:
            if order is not None:
                if order == 0 and self._chat_order_next > 0 and not self._chat_order_buffer:
                    self._chat_order_next = 0
                self._chat_order_buffer[order] = item
            else:
                self._immediate.append(item)
        self._wake.set()

        if not item.event.wait(timeout=SYNTH_TIMEOUT_S):
            raise TimeoutError("TTS 合成超时")
        if item.error is not None:
            raise item.error
        if item.result is None:
            raise RuntimeError("TTS 合成未返回音频")
        return item.result

    def _pop_next_batch(self) -> list[_Pending] | None:
        with self._lock:
            if self._chat_order_next in self._chat_order_buffer:
                item = self._chat_order_buffer.pop(self._chat_order_next)
                self._chat_order_next += 1
                return [item]
            if self._immediate:
                return [self._immediate.pop(0)]
            if self._priority_batches:
                return self._priority_batches.pop(0)
        return None

    def synthesize_batch(
        self,
        engine: Any,
        texts: list[str],
        speaker_id: int = 0,
        seed: int | None = None,
    ) -> list[bytes]:
        cleaned = [text.strip() for text in texts if text.strip()]
        if not cleaned:
            return []

        items = [
            _Pending(engine=engine, text=text, speaker_id=speaker_id, seed=seed)
            for text in cleaned
        ]
        with self._lock:
            if len(items) > 1:
                self._priority_batches.append(items)
            else:
                self._pending.extend(items)
        self._wake.set()

        for item in items:
            if not item.event.wait(timeout=SYNTH_TIMEOUT_S):
                raise TimeoutError("TTS 合成超时")
            if item.error is not None:
                raise item.error
            if item.result is None:
                raise RuntimeError("TTS 合成未返回音频")

        return [item.result for item in items if item.result is not None]

    def _worker_loop(self) -> None:
        while True:
            self._wake.wait(timeout=0.05)
            self._wake.clear()
            while True:
                batch = self._pop_next_batch()
                if not batch:
                    batch = self._collect_batch()
                if not batch:
                    break
                self._process_batch(batch)

    def _collect_batch(self) -> list[_Pending]:
        with self._lock:
            if not self._pending:
                return []
            anchor = self._pending[0]
            key = _group_key(anchor)
            deadline = anchor.enqueued_at + (MAX_WAIT_MS / 1000.0)

        matching: list[_Pending] = []
        while True:
            with self._lock:
                matching = []
                for item in self._pending:
                    if _group_key(item) != key:
                        break
                    matching.append(item)
                    if len(matching) >= MAX_BATCH_SIZE:
                        break
                if len(matching) >= MAX_BATCH_SIZE:
                    break
                if time.monotonic() >= deadline:
                    break
            time.sleep(0.005)

        with self._lock:
            if not self._pending or _group_key(self._pending[0]) != key:
                return []
            count = min(len(matching), MAX_BATCH_SIZE) if matching else 1
            batch = self._pending[:count]
            del self._pending[:count]
            return batch

    def _process_batch(self, items: list[_Pending]) -> None:
        engine = items[0].engine
        speaker_id = items[0].speaker_id
        seed = items[0].seed
        texts = [item.text for item in items]

        try:
            if hasattr(engine, "synthesize_batch"):
                wav_list = engine.synthesize_batch(
                    texts,
                    speaker_id=speaker_id,
                    seed=seed,
                )
                if len(wav_list) != len(items):
                    raise RuntimeError(
                        f"TTS batch 返回数量不匹配: expected={len(items)} got={len(wav_list)}"
                    )
                for item, wav_bytes in zip(items, wav_list, strict=True):
                    item.result = wav_bytes
            else:
                for item in items:
                    item.result = engine.synthesize(
                        item.text,
                        speaker_id=item.speaker_id,
                        seed=item.seed,
                    )

            preview = ", ".join(
                f'"{text[:16]}..."' if len(text) > 16 else f'"{text}"' for text in texts
            )
            order_hint = ""
            if len(items) == 1 and items[0].order is not None:
                order_hint = f" order={items[0].order}"
            print(f"[TTS/Batch] size={len(items)}{order_hint} {preview}", flush=True)
        except Exception as error:  # noqa: BLE001
            print(f"[TTS/Batch] 失败 size={len(items)}: {error}", flush=True)
            traceback.print_exc()
            for item in items:
                item.error = error
        finally:
            for item in items:
                item.event.set()


_dispatcher: BatchInferenceDispatcher | None = None
_dispatcher_lock = threading.Lock()


def _get_dispatcher() -> BatchInferenceDispatcher:
    global _dispatcher
    with _dispatcher_lock:
        if _dispatcher is None:
            _dispatcher = BatchInferenceDispatcher()
        return _dispatcher


def dispatch_synthesize(
    engine: Any,
    text: str,
    speaker_id: int = 0,
    seed: int | None = None,
) -> bytes:
    return _get_dispatcher().synthesize(engine, text, speaker_id=speaker_id, seed=seed)


def dispatch_synthesize_immediate(
    engine: Any,
    text: str,
    speaker_id: int = 0,
    seed: int | None = None,
    order: int | None = None,
) -> bytes:
    return _get_dispatcher().synthesize_immediate(
        engine,
        text,
        speaker_id=speaker_id,
        seed=seed,
        order=order,
    )


_parallel_pool: ParallelChatPool | None = None
_parallel_pool_lock = threading.Lock()


class ParallelChatPool:
    """聊天并行推理：最多 lanes 路同时占用 engine。

    有意设计，禁止修改：请求可带 order，本池忽略 order（无 order 串行等待）。
    展示序由前端队头释放保证。见 tts_voice/CONTRACT.md §Chat TTS parallel。
    """

    def __init__(self, lanes: int = 2) -> None:
        self._lanes = max(2, min(4, lanes))
        self._sem = threading.Semaphore(self._lanes)
        self._cfg_lock = threading.Lock()

    def configure(self, lanes: int) -> None:
        lanes = max(2, min(4, lanes))
        with self._cfg_lock:
            if lanes == self._lanes:
                return
            self._lanes = lanes
            self._sem = threading.Semaphore(lanes)

    def synthesize(
        self,
        engine: Any,
        text: str,
        speaker_id: int = 0,
        seed: int | None = None,
        order: int | None = None,
    ) -> bytes:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("text 不能为空")

        self._sem.acquire()
        started = time.monotonic()
        order_hint = f" order={order}" if order is not None else ""
        try:
            if hasattr(engine, "synthesize_batch"):
                wav = engine.synthesize_batch(
                    [cleaned],
                    speaker_id=speaker_id,
                    seed=seed,
                )[0]
            else:
                wav = engine.synthesize(cleaned, speaker_id=speaker_id, seed=seed)
            preview = f'"{cleaned[:16]}..."' if len(cleaned) > 16 else f'"{cleaned}"'
            dur_ms = int((time.monotonic() - started) * 1000)
            print(
                f"[TTS/Parallel] lanes={self._lanes}{order_hint} {dur_ms}ms {preview}",
                flush=True,
            )
            return wav
        except Exception as error:  # noqa: BLE001
            dur_ms = int((time.monotonic() - started) * 1000)
            print(
                f"[TTS/Parallel] 失败 lanes={self._lanes}{order_hint} {dur_ms}ms: {error}",
                flush=True,
            )
            traceback.print_exc()
            raise
        finally:
            self._sem.release()


def _get_parallel_pool(lanes: int) -> ParallelChatPool:
    global _parallel_pool
    with _parallel_pool_lock:
        if _parallel_pool is None:
            _parallel_pool = ParallelChatPool(lanes)
        else:
            _parallel_pool.configure(lanes)
        return _parallel_pool


def dispatch_synthesize_chat(
    engine: Any,
    text: str,
    speaker_id: int = 0,
    seed: int | None = None,
    order: int | None = None,
    parallel_lanes: int = 0,
) -> bytes:
    if parallel_lanes >= 2:
        return _get_parallel_pool(parallel_lanes).synthesize(
            engine,
            text,
            speaker_id=speaker_id,
            seed=seed,
            order=order,
        )
    return dispatch_synthesize_immediate(
        engine,
        text,
        speaker_id=speaker_id,
        seed=seed,
        order=order,
    )


def dispatch_synthesize_batch(
    engine: Any,
    texts: list[str],
    speaker_id: int = 0,
    seed: int | None = None,
) -> list[bytes]:
    return _get_dispatcher().synthesize_batch(
        engine,
        texts,
        speaker_id=speaker_id,
        seed=seed,
    )
