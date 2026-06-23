"""Qwen3 VoiceDesign 参考音 + Base 克隆样本管理（音色工坊）。"""

from __future__ import annotations

import gc
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from text_normalize import normalize_tts_text
from voice_forge_paths import (
    CUSTOM_SAMPLE_DIR,
    DEFAULT_SAMPLE_DIR,
    LEGACY_CLONE_DIR,
    OFFICIAL_SAMPLE_ID,
    PROJECT_ROOT,
    REGEN_FLAG,
    custom_sample_dir,
    profile_path,
    read_voice_forge_config,
    resolve_active_sample_dir,
    sample_paths,
    write_voice_forge_config_patch,
)

DEFAULT_CLONE_REFERENCE_TEXT = (
    "我会用柔和清澈的中文少女音色轻声说话，语速略慢，咬字完整自然，"
    "语气平稳文静，情感克制而不夸张，适合作为语音克隆的参考样本。"
)


def resolve_project_path(raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


def voice_design_model_dir(settings: dict) -> Path:
    raw = settings.get("voice_design_model_dir") or settings.get("model_dir", "")
    if not raw:
        raise RuntimeError("qwen_config.json 缺少 voice_design_model_dir / model_dir")
    path = resolve_project_path(str(raw))
    if not (path / "config.json").is_file():
        raise RuntimeError(
            f"未找到 Qwen3 VoiceDesign 模型: {path}\n"
            "请先运行「测试Qwen3.0_tts引擎.bat」下载 VoiceDesign 1.7B"
        )
    return path


def base_model_dir(settings: dict) -> Path:
    raw = settings.get("base_model_dir", "")
    if not raw:
        raise RuntimeError("qwen_config.json 缺少 base_model_dir")
    path = resolve_project_path(str(raw))
    if not (path / "config.json").is_file():
        raise RuntimeError(
            f"未找到 Qwen3 Base 克隆模型: {path}\n"
            "请先运行「测试Qwen3.0_tts引擎.bat」下载 Base 1.7B（选 5d）"
        )
    return path


def clone_reference_text(settings: dict) -> str:
    raw = settings.get("clone_reference_text", DEFAULT_CLONE_REFERENCE_TEXT).strip()
    return raw or DEFAULT_CLONE_REFERENCE_TEXT


def settings_fingerprint(settings: dict) -> str:
    payload = {
        "instruct": settings.get("instruct", "").strip(),
        "clone_reference_text": clone_reference_text(settings),
        "language": settings.get("language", "Chinese"),
        "generation": settings.get("generation") or {},
        "voice_design_model_dir": str(voice_design_model_dir(settings)),
        "base_model_dir": str(base_model_dir(settings)),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:24]


def consume_regenerate_flag() -> bool:
    if not REGEN_FLAG.is_file():
        return False
    try:
        REGEN_FLAG.unlink()
    except OSError:
        pass
    return True


def clear_sample_directory(sample_dir: Path) -> None:
    if not sample_dir.exists():
        return
    ref_wav, ref_text, ref_meta = sample_paths(sample_dir)
    for path in (ref_wav, ref_text, ref_meta):
        if path.is_file():
            path.unlink()


def ensure_official_sample_meta(settings: dict) -> None:
    ref_wav, ref_text, ref_meta = sample_paths(DEFAULT_SAMPLE_DIR)
    if not ref_wav.is_file() or not ref_text.is_file():
        return
    if ref_meta.is_file():
        return
    text = ref_text.read_text(encoding="utf-8").strip()
    if text != clone_reference_text(settings):
        return
    ref_meta.write_text(
        json.dumps(
            {
                "fingerprint": settings_fingerprint(settings),
                "source": "default",
                "displayName": "官方默认",
                "folderId": "default_sample",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_sample_profile(sample_dir: Path, *, folder_id: str, display_name: str) -> None:
    sample_dir.mkdir(parents=True, exist_ok=True)
    profile_path(sample_dir).write_text(
        json.dumps(
            {
                "folderId": folder_id,
                "displayName": display_name,
                "createdAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def migrate_legacy_clone_dir() -> None:
    if not LEGACY_CLONE_DIR.is_dir():
        return

    legacy_wav, legacy_text, legacy_meta = sample_paths(LEGACY_CLONE_DIR)
    if not legacy_wav.is_file():
        shutil.rmtree(LEGACY_CLONE_DIR, ignore_errors=True)
        return

    active = resolve_active_sample_dir()
    target_dir = active or CUSTOM_SAMPLE_DIR
    if active is None:
        flat_wav, _, _ = sample_paths(CUSTOM_SAMPLE_DIR)
        if flat_wav.is_file():
            shutil.rmtree(LEGACY_CLONE_DIR, ignore_errors=True)
            return
        target_dir = CUSTOM_SAMPLE_DIR

    target_dir.mkdir(parents=True, exist_ok=True)
    target_wav, target_text, target_meta = sample_paths(target_dir)
    if not target_wav.is_file():
        shutil.copy2(legacy_wav, target_wav)
        if legacy_text.is_file():
            shutil.copy2(legacy_text, target_text)
        if legacy_meta.is_file():
            shutil.copy2(legacy_meta, target_meta)
        print(f"[TTS/Qwen Clone] 已从旧目录迁移克隆样本 → {target_dir}", flush=True)

    shutil.rmtree(LEGACY_CLONE_DIR, ignore_errors=True)


def reference_is_current(settings: dict, sample_dir: Path) -> bool:
    ref_wav, ref_text, ref_meta = sample_paths(sample_dir)
    if not ref_wav.is_file() or not ref_text.is_file():
        return False
    if not ref_meta.is_file():
        if sample_dir == DEFAULT_SAMPLE_DIR:
            text = ref_text.read_text(encoding="utf-8").strip()
            return text == clone_reference_text(settings)
        # 自定义样本：有 reference 文件即可复用，避免因 meta 缺失回退到官方声线
        return True
    try:
        meta = json.loads(ref_meta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return meta.get("fingerprint") == settings_fingerprint(settings)


def load_reference(sample_dir: Path) -> tuple[Path, str]:
    ref_wav, ref_text, _ = sample_paths(sample_dir)
    text = ref_text.read_text(encoding="utf-8").strip()
    return ref_wav, text


def reference_files_missing(sample_dir: Path) -> list[str]:
    ref_wav, ref_text, _ = sample_paths(sample_dir)
    missing: list[str] = []
    if not ref_wav.is_file():
        missing.append("reference.wav")
    if not ref_text.is_file():
        missing.append("reference.txt")
    return missing


def require_clone_reference_files(sample_dir: Path | None = None) -> Path:
    """确认激活声线目录内已有 reference.wav 与 reference.txt，否则抛出明确错误。"""
    dir_path = sample_dir or resolve_active_sample_dir()
    if dir_path is None:
        raise RuntimeError("未选择激活的克隆声线，请在家窗口或音色工坊指定声线后再试。")
    missing = reference_files_missing(dir_path)
    if missing:
        raise RuntimeError(
            f"克隆参考音不完整（缺少 {', '.join(missing)}）：{dir_path}\n"
            "请将 reference.wav 与 reference.txt 放入该声线目录，"
            "或在音色工坊使用「创造新音色 / 重新生成声线」。"
        )
    return dir_path


def clone_reference_unavailable_error(sample_dir: Path) -> RuntimeError:
    missing = reference_files_missing(sample_dir)
    label = ", ".join(missing) if missing else "reference.wav / reference.txt"
    return RuntimeError(
        f"克隆参考音不可用（缺少 {label}）：{sample_dir}\n"
        "请将 reference.wav 与 reference.txt 放入该声线目录，"
        "或在音色工坊使用「创造新音色 / 重新生成声线」。"
    )


def _prepare_torch_env() -> tuple[str, torch.dtype]:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.pop("HF_ENDPOINT", None)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    return device, dtype


def _unload_model(model: object | None) -> None:
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def generate_reference_clip(
    settings: dict,
    target_dir: Path,
    *,
    display_name: str | None = None,
    folder_id: str | None = None,
) -> tuple[Path, str]:
    from qwen_tts import Qwen3TTSModel

    device, dtype = _prepare_torch_env()
    design_dir = voice_design_model_dir(settings)
    text = normalize_tts_text(clone_reference_text(settings))
    instruct = settings.get("instruct", "").strip()
    language = settings.get("language", "Chinese")
    generation = dict(settings.get("generation") or {})

    print(
        f"[TTS/Qwen Clone] 正在用 VoiceDesign 生成克隆参考音...\n"
        f"               model={design_dir}\n"
        f"               save={target_dir}\n"
        f"               text={text[:32]}...",
        flush=True,
    )

    design_model = Qwen3TTSModel.from_pretrained(
        str(design_dir),
        device_map=device,
        dtype=dtype,
        attn_implementation="eager",
    )
    with torch.no_grad():
        wavs, sample_rate = design_model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
            **generation,
        )
    _unload_model(design_model)

    target_dir.mkdir(parents=True, exist_ok=True)
    ref_wav, ref_text, ref_meta = sample_paths(target_dir)
    audio = np.asarray(wavs[0], dtype=np.float32)
    sf.write(str(ref_wav), audio, sample_rate)
    ref_text.write_text(text + "\n", encoding="utf-8")

    profile = read_voice_forge_config().get("activeSample") or {}
    resolved_folder_id = folder_id or profile.get("folderId") or target_dir.name
    resolved_display_name = display_name or profile.get("displayName") or resolved_folder_id

    if target_dir != DEFAULT_SAMPLE_DIR:
        write_sample_profile(
            target_dir,
            folder_id=str(resolved_folder_id),
            display_name=str(resolved_display_name),
        )

    ref_meta.write_text(
        json.dumps(
            {
                "fingerprint": settings_fingerprint(settings),
                "sample_rate": sample_rate,
                "language": language,
                "source": "default" if target_dir == DEFAULT_SAMPLE_DIR else "custom",
                "folderId": resolved_folder_id,
                "displayName": resolved_display_name,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[TTS/Qwen Clone] 参考音已保存: {ref_wav}", flush=True)
    print("[TTS/Qwen Clone] 生成完毕，请试听效果！", flush=True)
    return ref_wav, text


def ensure_clone_reference(
    settings: dict,
    *,
    force: bool = False,
    allow_generate: bool = True,
) -> tuple[Path, str]:
    migrate_legacy_clone_dir()
    ensure_official_sample_meta(settings)

    active = read_voice_forge_config().get("activeSample") or {}
    active_folder_id = active.get("folderId") if isinstance(active, dict) else None
    active_folder_id = active_folder_id.strip() if isinstance(active_folder_id, str) else ""

    active_dir = resolve_active_sample_dir()
    if active_dir is None:
        if active_folder_id and active_folder_id not in {OFFICIAL_SAMPLE_ID, "default", "official"}:
            raise RuntimeError(f"未找到激活的自定义声线目录: {active_folder_id}")
        raise RuntimeError("未选择激活的克隆声线，请在家窗口或音色工坊指定声线后再试。")

    if force:
        clear_sample_directory(active_dir)

    ref_wav, ref_text, _ = sample_paths(active_dir)
    if not force and ref_wav.is_file() and ref_text.is_file():
        ref_wav, text = load_reference(active_dir)
        print(
            f"[TTS/Qwen Clone] 复用当前声线样本: {ref_wav} (folder={active_dir.name})",
            flush=True,
        )
        return ref_wav, text

    if not allow_generate:
        raise clone_reference_unavailable_error(active_dir)

    return generate_reference_clip(
        settings,
        active_dir,
        display_name=active.get("displayName") if isinstance(active, dict) else None,
        folder_id=active_folder_id or active_dir.name,
    )


def prepare_custom_sample_folder(folder_id: str, display_name: str) -> Path:
    sample_dir = custom_sample_dir(folder_id)
    sample_dir.mkdir(parents=True, exist_ok=True)
    write_sample_profile(sample_dir, folder_id=folder_id, display_name=display_name)
    write_voice_forge_config_patch(
        {
            "activeSample": {
                "folderId": folder_id,
                "displayName": display_name,
                "pending": True,
            }
        }
    )
    return sample_dir
