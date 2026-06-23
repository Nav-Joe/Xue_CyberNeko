"""语料触摸反馈音频缓存：预合成 WAV，点击时零推理播放。"""

from __future__ import annotations

import hashlib
import json
import random
import shutil
import threading
import time
from pathlib import Path
from typing import Any

from voice_forge_paths import (
    get_active_sample_info,
    resolve_active_sample_dir,
    write_touch_cache_pointer,
)

VARIANT_COUNT = 3
VARIANT_SEEDS = (42, 1337, 9001)


class AudioCacheManager:
    def __init__(
        self,
        cache_dir: Path,
        corpus_path: Path,
        backend: str,
        *,
        config_path: Path | None = None,
        model_path: Path | None = None,
        qwen_config_path: Path | None = None,
        qwen_model_dir: Path | None = None,
        qwen_clone_ref: Path | None = None,
    ) -> None:
        self.cache_dir = cache_dir
        self.corpus_path = corpus_path
        self.backend = backend
        self.config_path = config_path
        self.model_path = model_path
        self.qwen_config_path = qwen_config_path
        self.qwen_model_dir = qwen_model_dir
        self.qwen_clone_ref = qwen_clone_ref
        self.manifest_path = cache_dir / "manifest.json"
        self._lock = threading.Lock()
        self._building = False
        self._progress_done = 0
        self._progress_total = 0
        self._last_error: str | None = None

    def text_key(self, text: str) -> str:
        return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]

    def _cache_sample_dir(self) -> Path | None:
        """与当前 cache_dir 对应的声线目录（优先 reference.wav，而非全局 activeSample）。"""
        if self.qwen_clone_ref and self.qwen_clone_ref.is_file():
            return self.qwen_clone_ref.parent
        if self.cache_dir.parent.name == "touch_cache":
            return self.cache_dir.parent
        return resolve_active_sample_dir()

    def _folder_id_for_sample_dir(self, sample_dir: Path | None) -> str | None:
        if sample_dir is None:
            return None
        profile_path = sample_dir / "profile.json"
        if profile_path.is_file():
            try:
                profile = json.loads(profile_path.read_text(encoding="utf-8"))
                folder_id = profile.get("folderId")
                if isinstance(folder_id, str) and folder_id.strip():
                    return folder_id.strip()
            except json.JSONDecodeError:
                pass
        meta_path = sample_dir / "meta.json"
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                folder_id = meta.get("folderId")
                if isinstance(folder_id, str) and folder_id.strip():
                    return folder_id.strip()
            except json.JSONDecodeError:
                pass
        name = sample_dir.name.strip()
        return name or None

    def _active_sample_identity(self) -> bytes:
        """稳定标识克隆参考音（不含语料、不含 voice-forge 展示名等易变字段）。"""
        payload: dict[str, str] = {}
        sample_dir = self._cache_sample_dir()
        folder_id = self._folder_id_for_sample_dir(sample_dir)
        if folder_id:
            payload["folderId"] = folder_id

        ref_path = self.qwen_clone_ref
        if ref_path is None and sample_dir is not None:
            candidate = sample_dir / "reference.wav"
            if candidate.is_file():
                ref_path = candidate

        if ref_path and ref_path.is_file():
            payload["ref"] = hashlib.sha256(ref_path.read_bytes()).hexdigest()[:24]

        if sample_dir is not None:
            meta_path = sample_dir / "meta.json"
            if meta_path.is_file():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    fingerprint = meta.get("fingerprint")
                    if isinstance(fingerprint, str) and fingerprint.strip():
                        payload["fingerprint"] = fingerprint.strip()
                except json.JSONDecodeError:
                    pass

        if not payload:
            return b""

        return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")

    def compute_engine_hash(self) -> str:
        """克隆引擎 / 后端身份（不含语料文本）。"""
        digest = hashlib.sha256()
        digest.update(self.backend.encode("utf-8"))

        if self.backend == "qwen":
            if self.qwen_config_path and self.qwen_config_path.is_file():
                digest.update(self.qwen_config_path.read_bytes())
            digest.update(self._active_sample_identity())
            model_file = None
            if self.qwen_model_dir:
                model_file = self.qwen_model_dir / "model.safetensors"
            if model_file and model_file.is_file():
                stat = model_file.stat()
                digest.update(f"{stat.st_size}:{int(stat.st_mtime)}".encode("utf-8"))
        else:
            if self.config_path and self.config_path.is_file():
                digest.update(self.config_path.read_bytes())
            if self.model_path and self.model_path.is_file():
                stat = self.model_path.stat()
                digest.update(f"{stat.st_size}:{int(stat.st_mtime)}".encode("utf-8"))

        return digest.hexdigest()[:24]

    def compute_corpus_file_hash(self) -> str:
        return hashlib.sha256(self.corpus_path.read_bytes()).hexdigest()[:16]

    def compute_source_hash(self) -> str:
        """完整指纹（引擎 + 语料文件），用于 touch_cache 指针等。"""
        digest = hashlib.sha256()
        digest.update(self.compute_engine_hash().encode("utf-8"))
        digest.update(self.corpus_path.read_bytes())
        return digest.hexdigest()[:24]

    def collect_lines(self) -> list[str]:
        data = json.loads(self.corpus_path.read_text(encoding="utf-8"))
        lines: set[str] = set()
        for part_lines in data.values():
            if not isinstance(part_lines, list):
                continue
            for line in part_lines:
                if isinstance(line, str) and line.strip():
                    lines.add(line.strip())
        return sorted(lines)

    def load_manifest(self) -> dict[str, Any] | None:
        if not self.manifest_path.is_file():
            return None
        try:
            return json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

    def _entry_wavs_complete(self, entry: dict[str, Any]) -> bool:
        key = entry.get("key")
        if not isinstance(key, str) or not key.strip():
            return False
        line_dir = self.cache_dir / key.strip()
        for variant in range(VARIANT_COUNT):
            if not (line_dir / f"{variant}.wav").is_file():
                return False
        return True

    def _active_sample_matches(self, manifest: dict[str, Any]) -> bool:
        if self.backend != "qwen":
            return True
        manifest_active = manifest.get("active_sample")
        if not isinstance(manifest_active, dict):
            return True
        cached_id = manifest_active.get("folderId")
        if not isinstance(cached_id, str) or not cached_id.strip():
            return True
        current_id = self._folder_id_for_sample_dir(self._cache_sample_dir())
        if current_id and current_id.strip() != cached_id.strip():
            return False
        return True

    def _manifest_engine_matches(self, manifest: dict[str, Any]) -> bool:
        if manifest.get("backend") != self.backend:
            return False
        engine_hash = manifest.get("engine_hash")
        if isinstance(engine_hash, str) and engine_hash.strip():
            return engine_hash == self.compute_engine_hash()
        return True

    def _line_content_hash(self, text: str) -> str:
        return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]

    def _line_entry_stale(self, line: str, entry: dict[str, Any] | None) -> bool:
        if not isinstance(entry, dict) or not self._entry_wavs_complete(entry):
            return True
        stored_hash = entry.get("line_hash")
        if isinstance(stored_hash, str) and stored_hash.strip():
            return stored_hash != self._line_content_hash(line)
        return False

    def _lines_missing_from_cache(self, lines: list[str], entries: dict[str, Any]) -> list[str]:
        missing: list[str] = []
        for line in lines:
            entry = entries.get(line)
            if self._line_entry_stale(line, entry):
                missing.append(line)
        return missing

    def _should_full_rebuild(self, manifest: dict[str, Any] | None) -> bool:
        if not manifest:
            return True
        if manifest.get("backend") != self.backend:
            return True
        if not self._active_sample_matches(manifest):
            return True

        engine_hash = self.compute_engine_hash()
        stored_engine = manifest.get("engine_hash")
        if isinstance(stored_engine, str) and stored_engine.strip():
            return stored_engine != engine_hash

        stored_source = manifest.get("source_hash")
        if not isinstance(stored_source, str) or stored_source == self.compute_source_hash():
            return False

        stored_corpus = manifest.get("corpus_hash")
        current_corpus = self.compute_corpus_file_hash()
        if stored_corpus and stored_corpus == current_corpus:
            return True
        if stored_corpus is None:
            return True
        return False

    def _prune_removed_lines(self, entries: dict[str, dict[str, str]], current_lines: set[str]) -> None:
        for old_line in list(entries.keys()):
            if old_line in current_lines:
                continue
            entry = entries.pop(old_line, None)
            if not isinstance(entry, dict):
                continue
            key = entry.get("key")
            if isinstance(key, str) and key.strip():
                shutil.rmtree(self.cache_dir / key.strip(), ignore_errors=True)

    def is_cache_valid(self) -> bool:
        manifest = self.load_manifest()
        if not manifest:
            return False
        if not self._manifest_engine_matches(manifest):
            return False
        if not self._active_sample_matches(manifest):
            return False

        entries = manifest.get("entries")
        if not isinstance(entries, dict):
            return False

        lines = self.collect_lines()
        return len(self._lines_missing_from_cache(lines, entries)) == 0

    def estimate_prewarm_work(self) -> tuple[list[str], int]:
        lines = self.collect_lines()
        manifest = self.load_manifest()
        if self._should_full_rebuild(manifest):
            work_lines = lines
        else:
            entries = manifest.get("entries") if isinstance(manifest, dict) else None
            if not isinstance(entries, dict):
                entries = {}
            work_lines = self._lines_missing_from_cache(lines, entries)
        return work_lines, len(work_lines) * VARIANT_COUNT

    def _resolve_progress(self, corpus_total: int, work_total: int) -> dict[str, int]:
        """进度条只反映本次预热工作量，不用全库语料数充总数。"""
        if self._building:
            if self._progress_total > 0:
                total = self._progress_total
            elif work_total > 0:
                total = work_total
            else:
                total = corpus_total
            return {"done": self._progress_done, "total": total}

        if work_total > 0 and not self.is_cache_valid():
            return {"done": 0, "total": work_total}

        return {"done": 0, "total": 0}

    def status(self) -> dict[str, Any]:
        lines = self.collect_lines()
        corpus_total = len(lines) * VARIANT_COUNT
        valid = self.is_cache_valid()
        manifest = self.load_manifest()
        work_lines, work_total = self.estimate_prewarm_work()
        progress = self._resolve_progress(corpus_total, work_total)

        return {
            "backend": self.backend,
            "ready": valid and not self._building,
            "building": self._building,
            "stale": not valid,
            "source_hash": self.compute_source_hash(),
            "engine_hash": self.compute_engine_hash(),
            "manifest_hash": manifest.get("source_hash") if manifest else None,
            "line_count": len(lines),
            "variant_count": VARIANT_COUNT,
            "prewarm_work_lines": len(work_lines),
            "prewarm_work_total": work_total,
            "progress": progress,
            "error": self._last_error,
        }

    def clear(self) -> None:
        with self._lock:
            if self.cache_dir.exists():
                shutil.rmtree(self.cache_dir, ignore_errors=True)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self._progress_done = 0
            self._progress_total = 0
            self._last_error = None

    def resolve_wav_path(
        self,
        text: str,
        variant: int | None = None,
        *,
        allow_partial: bool = True,
    ) -> Path | None:
        manifest = self.load_manifest()
        if not manifest:
            return None

        if not allow_partial and not self.is_cache_valid():
            return None

        entry = manifest.get("entries", {}).get(text.strip())
        if not entry:
            return None

        index = variant if variant is not None else random.randint(0, VARIANT_COUNT - 1)
        index = max(0, min(index, VARIANT_COUNT - 1))
        path = self.cache_dir / entry["key"] / f"{index}.wav"
        return path if path.is_file() else None

    def _wait_for_build(self, timeout_s: float = 7200.0) -> bool:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            with self._lock:
                if not self._building:
                    return True
            time.sleep(0.25)
        return False

    def build_sync(self, engine: Any) -> None:
        with self._lock:
            already_building = self._building
        if already_building:
            if not self._wait_for_build():
                print("[TTS Cache] 等待后台预热超时", flush=True)
                return
            if self.is_cache_valid():
                print("[TTS Cache] 后台预热已完成", flush=True)
                return

        lines = self.collect_lines()
        current_line_set = set(lines)
        manifest = self.load_manifest()
        need_full_rebuild = self._should_full_rebuild(manifest)

        if need_full_rebuild:
            entries: dict[str, dict[str, str]] = {}
            lines_to_build = lines
        else:
            entries = dict(manifest.get("entries", {})) if isinstance(manifest, dict) else {}
            if not isinstance(entries, dict):
                entries = {}
            self._prune_removed_lines(entries, current_line_set)
            lines_to_build = self._lines_missing_from_cache(lines, entries)
            if not lines_to_build:
                self._finalize_manifest(entries, lines)
                print("[TTS Cache] 缓存已是最新，跳过生成", flush=True)
                return

        progress_total = len(lines_to_build) * VARIANT_COUNT

        with self._lock:
            if self._building:
                if not self._wait_for_build():
                    print("[TTS Cache] 等待后台预热超时", flush=True)
                    return
                if self.is_cache_valid():
                    print("[TTS Cache] 后台预热已完成", flush=True)
                    return
            self._building = True
            self._last_error = None
            self._progress_done = 0
            self._progress_total = progress_total

        try:
            if need_full_rebuild:
                print(
                    f"[TTS Cache] 声线或引擎已变更，正在全量重建缓存（{len(lines)} 句 × {VARIANT_COUNT}）...",
                    flush=True,
                )
                self.clear()
                entries = {}
                with self._lock:
                    self._building = True
                    self._progress_done = 0
                    self._progress_total = progress_total
            else:
                skipped = len(lines) - len(lines_to_build)
                print(
                    f"[TTS Cache] 语料有变更，增量预热 {len(lines_to_build)} 句"
                    f"（保留 {skipped} 句已有缓存）× {VARIANT_COUNT} ...",
                    flush=True,
                )
                self.cache_dir.mkdir(parents=True, exist_ok=True)

            for line in lines_to_build:
                if line in entries:
                    old_key = entries[line].get("key")
                    if isinstance(old_key, str) and old_key.strip():
                        shutil.rmtree(self.cache_dir / old_key.strip(), ignore_errors=True)

                key = self.text_key(line)
                line_dir = self.cache_dir / key
                line_dir.mkdir(parents=True, exist_ok=True)
                entries[line] = {"key": key, "line_hash": self._line_content_hash(line)}

                for variant, seed in enumerate(VARIANT_SEEDS):
                    wav_bytes = engine.synthesize(line, speaker_id=0, seed=seed)
                    (line_dir / f"{variant}.wav").write_bytes(wav_bytes)
                    self._progress_done += 1
                    print(
                        f"[TTS Cache] [{self._progress_done}/{self._progress_total}] "
                        f"{line[:24]}... #{variant}",
                        flush=True,
                    )

            self._finalize_manifest(entries, lines)
            print("[TTS Cache] 缓存生成完成", flush=True)

        except Exception as error:  # noqa: BLE001
            self._last_error = str(error)
            print(f"[TTS Cache] 生成失败: {error}", flush=True)
            raise
        finally:
            with self._lock:
                self._building = False

    def _finalize_manifest(self, entries: dict[str, dict[str, str]], lines: list[str]) -> None:
        manifest: dict[str, Any] = {
            "backend": self.backend,
            "engine_hash": self.compute_engine_hash(),
            "corpus_hash": self.compute_corpus_file_hash(),
            "source_hash": self.compute_source_hash(),
            "variant_count": VARIANT_COUNT,
            "entries": entries,
        }

        sample_dir = self._cache_sample_dir()
        if sample_dir is not None:
            folder_id = self._folder_id_for_sample_dir(sample_dir)
            if folder_id:
                manifest["active_sample"] = {"folderId": folder_id}
        else:
            active = get_active_sample_info()
            if active:
                manifest["active_sample"] = active

        self.manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        if sample_dir is None:
            sample_dir = resolve_active_sample_dir()
        if sample_dir is not None:
            snapshot = sample_dir / "corpus.snapshot.json"
            if not snapshot.is_file() and self.corpus_path.is_file():
                snapshot.write_bytes(self.corpus_path.read_bytes())
            write_touch_cache_pointer(
                sample_dir,
                source_hash=manifest["source_hash"],
                ready=True,
                line_count=len(lines),
            )

    def build_async(self, engine: Any) -> None:
        if self._building:
            return
        if self.is_cache_valid():
            return

        def _runner() -> None:
            try:
                self.build_sync(engine)
            except Exception:
                pass

        threading.Thread(target=_runner, name="tts-audio-cache", daemon=True).start()
