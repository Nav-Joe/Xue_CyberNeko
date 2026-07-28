"""语料 touch_cache：键、哈希与全量/增量过期策略。

不改缓存键与判定语义；合成 / 锁 / build 循环仍在 `audio_cache.AudioCacheManager`。
契约断言见 `tests/test_audio_cache_policy.py` 与 ENGINE_HOOKS.md「语料缓存与增量预热」。
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

VARIANT_COUNT = 3
VARIANT_SEEDS = (42, 1337, 9001)


def text_key(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def line_content_hash(text: str) -> str:
    """单句内容指纹（与 text_key 算法相同，语义字段名不同）。"""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16]


def corpus_bytes_hash(corpus_bytes: bytes) -> str:
    return hashlib.sha256(corpus_bytes).hexdigest()[:16]


def source_hash_from_parts(engine_hash: str, corpus_bytes: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(engine_hash.encode("utf-8"))
    digest.update(corpus_bytes)
    return digest.hexdigest()[:24]


def collect_lines_from_corpus_data(data: Any) -> list[str]:
    lines: set[str] = set()
    if not isinstance(data, dict):
        return []
    for part_lines in data.values():
        if not isinstance(part_lines, list):
            continue
        for line in part_lines:
            if isinstance(line, str) and line.strip():
                lines.add(line.strip())
    return sorted(lines)


def folder_id_for_sample_dir(sample_dir: Path | None) -> str | None:
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


def active_sample_identity_bytes(
    sample_dir: Path | None,
    qwen_clone_ref: Path | None,
) -> bytes:
    """稳定标识克隆参考音（不含语料、不含 voice-forge 展示名等易变字段）。"""
    payload: dict[str, str] = {}
    folder_id = folder_id_for_sample_dir(sample_dir)
    if folder_id:
        payload["folderId"] = folder_id

    ref_path = qwen_clone_ref
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


def compute_engine_hash(
    backend: str,
    *,
    qwen_config_path: Path | None = None,
    qwen_model_dir: Path | None = None,
    qwen_clone_ref: Path | None = None,
    sample_dir: Path | None = None,
    config_path: Path | None = None,
    model_path: Path | None = None,
) -> str:
    """克隆引擎 / 后端身份（不含语料文本）。"""
    digest = hashlib.sha256()
    digest.update(backend.encode("utf-8"))

    if backend == "qwen":
        if qwen_config_path and qwen_config_path.is_file():
            digest.update(qwen_config_path.read_bytes())
        digest.update(active_sample_identity_bytes(sample_dir, qwen_clone_ref))
        model_file = None
        if qwen_model_dir:
            model_file = qwen_model_dir / "model.safetensors"
        if model_file and model_file.is_file():
            stat = model_file.stat()
            digest.update(f"{stat.st_size}:{int(stat.st_mtime)}".encode("utf-8"))
    else:
        if config_path and config_path.is_file():
            digest.update(config_path.read_bytes())
        if model_path and model_path.is_file():
            stat = model_path.stat()
            digest.update(f"{stat.st_size}:{int(stat.st_mtime)}".encode("utf-8"))

    return digest.hexdigest()[:24]


def entry_wavs_complete(
    cache_dir: Path,
    entry: dict[str, Any],
    *,
    variant_count: int = VARIANT_COUNT,
) -> bool:
    key = entry.get("key")
    if not isinstance(key, str) or not key.strip():
        return False
    line_dir = cache_dir / key.strip()
    for variant in range(variant_count):
        if not (line_dir / f"{variant}.wav").is_file():
            return False
    return True


def active_sample_matches(
    backend: str,
    manifest: dict[str, Any],
    current_folder_id: str | None,
) -> bool:
    if backend != "qwen":
        return True
    manifest_active = manifest.get("active_sample")
    if not isinstance(manifest_active, dict):
        return True
    cached_id = manifest_active.get("folderId")
    if not isinstance(cached_id, str) or not cached_id.strip():
        return True
    if current_folder_id and current_folder_id.strip() != cached_id.strip():
        return False
    return True


def manifest_engine_matches(
    manifest: dict[str, Any],
    backend: str,
    engine_hash: str,
) -> bool:
    if manifest.get("backend") != backend:
        return False
    stored = manifest.get("engine_hash")
    if isinstance(stored, str) and stored.strip():
        return stored == engine_hash
    return True


def line_entry_stale(
    line: str,
    entry: dict[str, Any] | None,
    *,
    wavs_complete: bool,
) -> bool:
    if not isinstance(entry, dict) or not wavs_complete:
        return True
    stored_hash = entry.get("line_hash")
    if isinstance(stored_hash, str) and stored_hash.strip():
        return stored_hash != line_content_hash(line)
    return False


def lines_missing_from_cache(
    lines: list[str],
    entries: dict[str, Any],
    *,
    cache_dir: Path,
    variant_count: int = VARIANT_COUNT,
) -> list[str]:
    missing: list[str] = []
    for line in lines:
        entry = entries.get(line)
        complete = (
            entry_wavs_complete(cache_dir, entry, variant_count=variant_count)
            if isinstance(entry, dict)
            else False
        )
        if line_entry_stale(line, entry if isinstance(entry, dict) else None, wavs_complete=complete):
            missing.append(line)
    return missing


def should_full_rebuild(
    manifest: dict[str, Any] | None,
    *,
    backend: str,
    engine_hash: str,
    source_hash: str,
    corpus_hash: str,
    active_sample_ok: bool,
) -> bool:
    """是否全量重建（与历史 AudioCacheManager._should_full_rebuild 同语义）。"""
    if not manifest:
        return True
    if manifest.get("backend") != backend:
        return True
    if not active_sample_ok:
        return True

    stored_engine = manifest.get("engine_hash")
    if isinstance(stored_engine, str) and stored_engine.strip():
        return stored_engine != engine_hash

    stored_source = manifest.get("source_hash")
    if not isinstance(stored_source, str) or stored_source == source_hash:
        return False

    stored_corpus = manifest.get("corpus_hash")
    if stored_corpus and stored_corpus == corpus_hash:
        return True
    if stored_corpus is None:
        return True
    return False
