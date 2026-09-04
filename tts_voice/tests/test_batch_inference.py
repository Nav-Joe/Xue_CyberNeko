# -*- coding: utf-8 -*-
"""BatchInferenceDispatcher unit tests."""

from __future__ import annotations

import threading
import time
import unittest

from services.batch_inference import (
    MAX_BATCH_SIZE,
    MAX_WAIT_MS,
    BatchInferenceDispatcher,
    ParallelChatPool,
    dispatch_synthesize,
    dispatch_synthesize_chat,
    dispatch_synthesize_immediate,
)


class _MockBatchEngine:
    batch_calls: list[list[str]] = []
    single_calls: list[str] = []

    def synthesize(self, text: str, speaker_id: int = 0, seed: int | None = None) -> bytes:
        del speaker_id, seed
        _MockBatchEngine.single_calls.append(text)
        time.sleep(0.02)
        return f"single:{text}".encode()

    def synthesize_batch(
        self,
        texts: list[str],
        speaker_id: int = 0,
        seed: int | None = None,
    ) -> list[bytes]:
        del speaker_id, seed
        _MockBatchEngine.batch_calls.append(list(texts))
        time.sleep(0.03)
        return [f"batch:{text}".encode() for text in texts]


class BatchInferenceDispatcherTest(unittest.TestCase):
    def setUp(self) -> None:
        _MockBatchEngine.batch_calls.clear()
        _MockBatchEngine.single_calls.clear()

    def test_batches_concurrent_requests_with_same_seed(self) -> None:
        dispatcher = BatchInferenceDispatcher()
        engine = _MockBatchEngine()
        results: list[bytes | BaseException] = [b""] * 3

        def worker(index: int, text: str) -> None:
            try:
                results[index] = dispatcher.synthesize(engine, text)
            except BaseException as error:  # noqa: BLE001
                results[index] = error

        threads = [
            threading.Thread(target=worker, args=(0, "seg-1")),
            threading.Thread(target=worker, args=(1, "seg-2")),
            threading.Thread(target=worker, args=(2, "seg-3")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(results[0], b"batch:seg-1")
        self.assertEqual(results[1], b"batch:seg-2")
        self.assertEqual(results[2], b"batch:seg-3")
        self.assertEqual(len(_MockBatchEngine.batch_calls), 1)
        self.assertEqual(len(_MockBatchEngine.batch_calls[0]), 3)
        self.assertEqual(_MockBatchEngine.single_calls, [])

    def test_immediate_chat_requests_process_in_order_not_arrival(self) -> None:
        dispatcher = BatchInferenceDispatcher()
        engine = _MockBatchEngine()
        done_order: list[str] = []
        start_gate = threading.Event()

        def delayed_synth(text: str, speaker_id: int = 0, seed: int | None = None) -> list[bytes]:
            del speaker_id, seed
            start_gate.wait(timeout=2)
            _MockBatchEngine.batch_calls.append([text])
            # 长句故意更慢，但必须先于后续短句返回
            delay = 0.08 if len(text) > 6 else 0.01
            time.sleep(delay)
            return [f"batch:{text}".encode()]

        engine.synthesize_batch = delayed_synth  # type: ignore[method-assign]
        results: dict[int, bytes] = {}

        def worker(order: int, text: str) -> None:
            results[order] = dispatcher.synthesize_immediate(engine, text, order=order)
            done_order.append(text)

        threads = [
            threading.Thread(target=worker, args=(2, "短句3")),
            threading.Thread(target=worker, args=(0, "这是一句很长很长的开场白")),
            threading.Thread(target=worker, args=(1, "短句2")),
        ]
        for thread in threads:
            thread.start()
        time.sleep(0.05)
        start_gate.set()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(done_order, ["这是一句很长很长的开场白", "短句2", "短句3"])
        self.assertEqual(len(_MockBatchEngine.batch_calls), 3)

    def test_immediate_chat_requests_not_micro_batched(self) -> None:
        dispatcher = BatchInferenceDispatcher()
        engine = _MockBatchEngine()
        results: list[bytes | BaseException] = [b""] * 3
        done_order: list[str] = []

        def worker(index: int, text: str) -> None:
            try:
                results[index] = dispatcher.synthesize_immediate(engine, text, order=index)
                done_order.append(text)
            except BaseException as error:  # noqa: BLE001
                results[index] = error

        threads = [
            threading.Thread(target=worker, args=(0, "seg-1")),
            threading.Thread(target=worker, args=(1, "seg-2")),
            threading.Thread(target=worker, args=(2, "seg-3")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(results[0], b"batch:seg-1")
        self.assertEqual(results[1], b"batch:seg-2")
        self.assertEqual(results[2], b"batch:seg-3")
        self.assertEqual(len(_MockBatchEngine.batch_calls), 3)
        self.assertTrue(all(len(batch) == 1 for batch in _MockBatchEngine.batch_calls))
        self.assertEqual(done_order, ["seg-1", "seg-2", "seg-3"])

    def test_different_seed_not_batched_together(self) -> None:
        dispatcher = BatchInferenceDispatcher()
        engine = _MockBatchEngine()

        first = dispatcher.synthesize(engine, "line-1", seed=1)
        second = dispatcher.synthesize(engine, "line-2", seed=2)

        self.assertEqual(first, b"batch:line-1")
        self.assertEqual(second, b"batch:line-2")
        self.assertEqual(len(_MockBatchEngine.batch_calls), 2)
        self.assertEqual(len(_MockBatchEngine.batch_calls[0]), 1)
        self.assertEqual(len(_MockBatchEngine.batch_calls[1]), 1)
        self.assertEqual(_MockBatchEngine.single_calls, [])

    def test_dispatch_synthesize_singleton(self) -> None:
        engine = _MockBatchEngine()
        wav = dispatch_synthesize(engine, "hello")
        self.assertEqual(wav, b"batch:hello")
        self.assertEqual(_MockBatchEngine.batch_calls, [["hello"]])

    def test_dispatch_synthesize_chat_parallel_ignores_order(self) -> None:
        # tts_voice/CONTRACT.md + chat CONTRACT：
        # 并行时前端仍传 order、后端忽略 — 有意设计，禁止修改。
        engine = _MockBatchEngine()
        done_order: list[str] = []
        start_gate = threading.Event()

        def delayed_synth(
            texts: list[str],
            speaker_id: int = 0,
            seed: int | None = None,
        ) -> list[bytes]:
            del speaker_id, seed
            start_gate.wait(timeout=2)
            text = texts[0]
            _MockBatchEngine.batch_calls.append(list(texts))
            delay = 0.08 if text.startswith("long") else 0.01
            time.sleep(delay)
            done_order.append(text)
            return [f"batch:{text}".encode()]

        engine.synthesize_batch = delayed_synth  # type: ignore[method-assign]
        results: dict[int, bytes] = {}

        def worker(order: int, text: str) -> None:
            results[order] = dispatch_synthesize_chat(
                engine,
                text,
                order=order,
                parallel_lanes=2,
            )

        threads = [
            threading.Thread(target=worker, args=(0, "long-first")),
            threading.Thread(target=worker, args=(1, "short-2")),
        ]
        for thread in threads:
            thread.start()
        time.sleep(0.02)
        start_gate.set()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(set(results.keys()), {0, 1})
        self.assertEqual(len(_MockBatchEngine.batch_calls), 2)
        # 完成序可乱：证明池未按 order 阻塞（有意设计，禁止修改）
        self.assertNotEqual(done_order, ["long-first", "short-2"])

    def test_dispatch_synthesize_chat_serial_when_lanes_zero(self) -> None:
        # CONTRACT：parallel_lanes=0 → 串行有序
        engine = _MockBatchEngine()
        done_order: list[str] = []

        def worker(order: int, text: str) -> None:
            dispatch_synthesize_chat(engine, text, order=order, parallel_lanes=0)
            done_order.append(text)

        threads = [
            threading.Thread(target=worker, args=(0, "seg-1")),
            threading.Thread(target=worker, args=(1, "seg-2")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(done_order, ["seg-1", "seg-2"])

    def test_dispatch_synthesize_chat_lanes_one_is_serial_ordered(self) -> None:
        # CONTRACT：parallel_lanes=1 仅文档化，与 0 同走串行有序；API 不禁止 1。
        engine = _MockBatchEngine()
        done_order: list[str] = []

        def worker(order: int, text: str) -> None:
            dispatch_synthesize_chat(engine, text, order=order, parallel_lanes=1)
            done_order.append(text)

        threads = [
            threading.Thread(target=worker, args=(0, "a")),
            threading.Thread(target=worker, args=(1, "b")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(done_order, ["a", "b"])

    def test_parallel_pool_peak_concurrency_does_not_exceed_lanes(self) -> None:
        # CONTRACT：并行档 semaphore 与前端 lanes 对齐，峰时并发 ≤ lanes
        engine = _MockBatchEngine()
        lock = threading.Lock()
        active = 0
        peak = 0
        hold = threading.Event()

        def delayed_synth(
            texts: list[str],
            speaker_id: int = 0,
            seed: int | None = None,
        ) -> list[bytes]:
            del speaker_id, seed
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            hold.wait(timeout=2)
            with lock:
                active -= 1
            text = texts[0]
            _MockBatchEngine.batch_calls.append(list(texts))
            return [f"batch:{text}".encode()]

        engine.synthesize_batch = delayed_synth  # type: ignore[method-assign]
        results: dict[int, bytes] = {}

        def worker(order: int, text: str) -> None:
            results[order] = dispatch_synthesize_chat(
                engine,
                text,
                order=order,
                parallel_lanes=2,
            )

        threads = [
            threading.Thread(target=worker, args=(0, "a")),
            threading.Thread(target=worker, args=(1, "b")),
            threading.Thread(target=worker, args=(2, "c")),
        ]
        for thread in threads:
            thread.start()
        time.sleep(0.05)
        with lock:
            self.assertLessEqual(peak, 2)
            self.assertLessEqual(active, 2)
        hold.set()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(set(results.keys()), {0, 1, 2})
        self.assertLessEqual(peak, 2)

    def test_parallel_pool_clamps_lanes_to_2_4(self) -> None:
        # CONTRACT：ParallelChatPool 将 lanes clamp 到 [2, 4]
        high = ParallelChatPool(lanes=99)
        self.assertEqual(high._lanes, 4)
        high.configure(1)
        self.assertEqual(high._lanes, 2)
        mid = ParallelChatPool(lanes=3)
        self.assertEqual(mid._lanes, 3)

    def test_max_batch_size_matches_frontend_serial_prefetch_window(self) -> None:
        # 串行窗两侧都写 5，但含义不同：前端=HTTP 预取上限；此处=非 chat micro-batch
        self.assertEqual(MAX_BATCH_SIZE, 5)


if __name__ == "__main__":
    print(f"MAX_BATCH_SIZE={MAX_BATCH_SIZE} MAX_WAIT_MS={MAX_WAIT_MS}")
    unittest.main()
