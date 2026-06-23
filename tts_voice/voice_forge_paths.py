"""音色工坊克隆样本目录（官方 default / 用户 custom）。"""

from __future__ import annotations

import json
import re
import secrets
from pathlib import Path

from backend_config import RUNTIME_DIR

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VOICE_FORGE_ROOT = PROJECT_ROOT / "voice_forge"
DEFAULT_SAMPLE_DIR = VOICE_FORGE_ROOT / "default_sample"
CUSTOM_SAMPLE_DIR = VOICE_FORGE_ROOT / "custom_sample"
LEGACY_CLONE_DIR = PROJECT_ROOT / ".runtime" / "qwen-clone"
REGEN_FLAG = RUNTIME_DIR / "regenerate-voice-model.flag"
CORPUS_PREWARM_FLAG = RUNTIME_DIR / "corpus-prewarm.flag"
REALTIME_INFERENCE_FILE = RUNTIME_DIR / "realtime-inference.env"
VOICE_FORGE_CONFIG_FILE = RUNTIME_DIR / "voice-forge.json"

REF_WAV_NAME = "reference.wav"
REF_TEXT_NAME = "reference.txt"
REF_META_NAME = "meta.json"
PROFILE_NAME = "profile.json"

OTHER_CUSTOM_CACHE_ROOT = VOICE_FORGE_ROOT / "other_custom_cache"
OFFICIAL_SAMPLE_ID = "default_sample"
OFFICIAL_SAMPLE_LABEL = "默认配置"
TOUCH_CACHE_DIR_NAME = "touch_cache"
TOUCH_CACHE_POINTER_NAME = "touch_cache.json"
CORPUS_SNAPSHOT_NAME = "corpus.snapshot.json"


def touch_cache_dir_for_sample(sample_dir: Path) -> Path:
    return sample_dir / TOUCH_CACHE_DIR_NAME


def alt_engine_cache_root(engine_name: str) -> Path:
    safe = engine_name.strip() or "unknown"
    return OTHER_CUSTOM_CACHE_ROOT / safe


def alt_engine_touch_cache_dir(engine_name: str) -> Path:
    return alt_engine_cache_root(engine_name) / TOUCH_CACHE_DIR_NAME


def alt_engine_corpus_snapshot_path(engine_name: str) -> Path:
    return alt_engine_cache_root(engine_name) / CORPUS_SNAPSHOT_NAME


def corpus_snapshot_path(sample_dir: Path) -> Path:
    return sample_dir / CORPUS_SNAPSHOT_NAME


def touch_cache_pointer_path(sample_dir: Path) -> Path:
    return sample_dir / TOUCH_CACHE_POINTER_NAME


def resolve_touch_cache_dir(folder_id: str | None = None) -> Path | None:
    if folder_id:
        sample_dir = resolve_sample_dir(folder_id.strip())
    else:
        sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        return None
    return touch_cache_dir_for_sample(sample_dir)


def resolve_corpus_path_for_sample(sample_dir: Path | None = None) -> Path:
    from touch_mode_config import resolve_corpus_path

    if sample_dir is not None:
        snapshot = corpus_snapshot_path(sample_dir)
        if snapshot.is_file():
            return snapshot
    return resolve_corpus_path()


def read_touch_cache_pointer(sample_dir: Path) -> dict | None:
    pointer = touch_cache_pointer_path(sample_dir)
    if not pointer.is_file():
        return None
    try:
        data = json.loads(pointer.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def write_touch_cache_pointer(
    sample_dir: Path,
    *,
    source_hash: str,
    ready: bool,
    line_count: int,
) -> None:
    from datetime import datetime, timezone

    folder_id = sample_dir.name
    profile = profile_path(sample_dir)
    if profile.is_file():
        try:
            meta = json.loads(profile.read_text(encoding="utf-8"))
            if isinstance(meta.get("folderId"), str) and meta["folderId"].strip():
                folder_id = meta["folderId"].strip()
        except json.JSONDecodeError:
            pass

    payload = {
        "version": 1,
        "folderId": folder_id,
        "cacheDir": TOUCH_CACHE_DIR_NAME,
        "sourceHash": source_hash,
        "ready": ready,
        "lineCount": line_count,
        "updatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    touch_cache_pointer_path(sample_dir).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clear_touch_cache_for_sample(sample_dir: Path) -> None:
    cache_dir = touch_cache_dir_for_sample(sample_dir)
    if cache_dir.exists():
        import shutil

        shutil.rmtree(cache_dir, ignore_errors=True)
    pointer = touch_cache_pointer_path(sample_dir)
    if pointer.is_file():
        pointer.unlink()


def is_touch_cache_ready(sample_dir: Path) -> bool:
    """样本目录下是否已有可用的语料预热缓存。"""
    pointer = read_touch_cache_pointer(sample_dir)
    if isinstance(pointer, dict) and pointer.get("ready") is True:
        return True

    cache_dir = touch_cache_dir_for_sample(sample_dir)
    manifest_path = cache_dir / "manifest.json"
    if not manifest_path.is_file():
        return False

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False

    entries = manifest.get("entries") if isinstance(manifest, dict) else None
    if not isinstance(entries, dict) or not entries:
        return False

    for entry in entries.values():
        if not isinstance(entry, dict):
            continue
        key = entry.get("key")
        if not isinstance(key, str) or not key.strip():
            continue
        if (cache_dir / key.strip() / "0.wav").is_file():
            return True
    return False


def sample_paths(sample_dir: Path) -> tuple[Path, Path, Path]:
    return (
        sample_dir / REF_WAV_NAME,
        sample_dir / REF_TEXT_NAME,
        sample_dir / REF_META_NAME,
    )


def profile_path(sample_dir: Path) -> Path:
    return sample_dir / PROFILE_NAME


def generate_folder_id() -> str:
    return f"vf_{secrets.token_hex(4)}"


def sanitize_display_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    return name[:32].strip()


def custom_sample_dir(folder_id: str) -> Path:
    return CUSTOM_SAMPLE_DIR / folder_id


def read_voice_forge_config() -> dict:
    if not VOICE_FORGE_CONFIG_FILE.is_file():
        return {}
    try:
        data = json.loads(VOICE_FORGE_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def write_voice_forge_config_patch(patch: dict) -> None:
    data = read_voice_forge_config()
    data.update(patch)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    VOICE_FORGE_CONFIG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


ALT_ENGINE_PREWARM_TARGET = "__alt_engine__"


def consume_corpus_prewarm_flag() -> str | None:
    """读取并清除语料预热目标（声线 folderId 或 __alt_engine__）；无请求时返回 None。"""
    if not CORPUS_PREWARM_FLAG.is_file():
        return None
    try:
        raw = CORPUS_PREWARM_FLAG.read_text(encoding="utf-8").strip()
    except OSError:
        raw = ""
    try:
        CORPUS_PREWARM_FLAG.unlink()
    except OSError:
        pass
    if not raw or raw == "1":
        active = get_active_sample_info()
        if isinstance(active, dict):
            folder_id = active.get("folderId")
            if isinstance(folder_id, str) and folder_id.strip():
                return folder_id.strip()
        return None
    return raw


def read_realtime_inference_enabled() -> bool:
    if not REALTIME_INFERENCE_FILE.is_file():
        return False
    try:
        return REALTIME_INFERENCE_FILE.read_text(encoding="utf-8").strip() == "1"
    except OSError:
        return False


def get_active_sample_info() -> dict | None:
    data = read_voice_forge_config()
    active = data.get("activeSample")
    return active if isinstance(active, dict) else None


def resolve_sample_dir(folder_id: str) -> Path | None:
    fid = folder_id.strip()
    if not fid:
        return None
    if fid in {OFFICIAL_SAMPLE_ID, "default", "official"}:
        return DEFAULT_SAMPLE_DIR
    return custom_sample_dir(fid)


def resolve_active_sample_dir() -> Path | None:
    active = get_active_sample_info()
    if not active:
        return None
    folder_id = active.get("folderId")
    if not isinstance(folder_id, str) or not folder_id.strip():
        return None
    return resolve_sample_dir(folder_id.strip())


def list_custom_sample_ids() -> list[str]:
    if not CUSTOM_SAMPLE_DIR.is_dir():
        return []
    result: list[str] = []
    for child in sorted(CUSTOM_SAMPLE_DIR.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        result.append(child.name)
    return result
