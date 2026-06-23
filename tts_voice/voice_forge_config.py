"""音色工坊：合并 qwen_config.json 与用户覆盖（.runtime/voice-forge.json）。"""

from __future__ import annotations

import json
from pathlib import Path

from backend_config import RUNTIME_DIR
from voice_forge_paths import OFFICIAL_SAMPLE_ID, get_active_sample_info

VOICE_FORGE_FILE = RUNTIME_DIR / "voice-forge.json"
_OFFICIAL_FOLDER_IDS = frozenset({OFFICIAL_SAMPLE_ID, "default", "official"})


def is_official_active_sample() -> bool:
    active = get_active_sample_info()
    if not isinstance(active, dict):
        return True
    kind = active.get("kind")
    if kind == "official":
        return True
    folder_id = active.get("folderId")
    if isinstance(folder_id, str) and folder_id.strip() in _OFFICIAL_FOLDER_IDS:
        return True
    return not folder_id


def load_merged_qwen_settings(config_path: Path) -> dict:
    if not config_path.is_file():
        raise RuntimeError(f"未找到 Qwen 配置: {config_path}")

    settings = json.loads(config_path.read_text(encoding="utf-8"))
    if not VOICE_FORGE_FILE.is_file():
        return settings

    try:
        override = json.loads(VOICE_FORGE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return settings

    # 官方默认声线始终使用 qwen_config.json 的 instruct，避免自定义声线 prompt 污染官方克隆。
    if is_official_active_sample():
        return settings

    instruct = override.get("instruct")
    if isinstance(instruct, str) and instruct.strip():
        settings["instruct"] = instruct.strip()

    return settings
