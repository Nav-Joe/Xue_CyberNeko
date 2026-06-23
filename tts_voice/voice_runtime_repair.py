"""启动时修复触摸模式 / 激活声线 / 会话之间的不一致状态。"""

from __future__ import annotations

from voice_forge_paths import (
    OFFICIAL_SAMPLE_ID,
    get_active_sample_info,
    read_voice_forge_config,
    resolve_active_sample_dir,
    sample_paths,
)
from voice_forge_session import (
    FLOW_CREATE_VOICE,
    PHASE_AWAITING_REVIEW,
    PHASE_GENERATING,
    PHASE_PENDING_RESTART,
    PHASE_PREWARMING,
    clear_session,
    read_session,
)
from touch_mode_config import read_touch_mode, write_touch_mode
from tts_config import read_engine_name
from engines.registry import engine_supports_voice_forge

_OFFICIAL_FOLDER_IDS = frozenset({OFFICIAL_SAMPLE_ID, "default", "official"})


def _active_sample_ready() -> bool:
    sample_dir = resolve_active_sample_dir()
    if sample_dir is None:
        return False
    ref_wav, ref_text, _ = sample_paths(sample_dir)
    return ref_wav.is_file() and ref_text.is_file()


def _should_clear_stuck_session(session: dict | None, *, touch_mode: str) -> bool:
    if not session:
        return False
    phase = session.get("phase")
    flow = session.get("flow")

    if touch_mode == "curated":
        if flow != FLOW_CREATE_VOICE:
            return False
        if phase == PHASE_AWAITING_REVIEW:
            return False
        if phase in {PHASE_PENDING_RESTART, PHASE_GENERATING}:
            return not _active_sample_ready()
        return phase in {PHASE_PREWARMING, PHASE_GENERATING}

    if flow != FLOW_CREATE_VOICE:
        return False
    if phase == PHASE_PREWARMING:
        return True
    return False


def _read_official_use_curated_clips() -> bool:
    data = read_voice_forge_config()
    value = data.get("officialUseCuratedClips")
    return value if isinstance(value, bool) else True


def _is_official_active(active: dict | None) -> bool:
    if not isinstance(active, dict):
        return True
    folder_id = active.get("folderId")
    kind = active.get("kind")
    if kind == "official":
        return True
    if isinstance(folder_id, str) and folder_id.strip() in _OFFICIAL_FOLDER_IDS:
        return True
    return not folder_id


def reconcile_runtime_voice_config() -> str:
    """修正磁盘配置并返回最终触摸模式。"""
    mode = read_touch_mode()
    active = get_active_sample_info()
    session = read_session()
    use_curated_clips = _read_official_use_curated_clips()

    folder_id = ""
    kind = None
    if isinstance(active, dict):
        raw_id = active.get("folderId")
        if isinstance(raw_id, str):
            folder_id = raw_id.strip()
        kind = active.get("kind")

    is_official = _is_official_active(active)

    if mode == "alt_engine_corpus":
        if engine_supports_voice_forge(read_engine_name()):
            write_touch_mode("curated")
            print(
                "[TTS/Config] 当前为 Qwen 引擎，已退出第三方语料模式",
                flush=True,
            )
            return "curated"
        from touch_mode_config import CUSTOM_CORPUS_PATH

        if not CUSTOM_CORPUS_PATH.is_file():
            write_touch_mode("curated")
            print(
                "[TTS/Config] 第三方语料文件缺失，已回退到精选音频模式",
                flush=True,
            )
            return "curated"

    if mode == "custom_corpus":
        invalid = not folder_id or not _active_sample_ready()
        if invalid:
            write_touch_mode("curated")
            if _should_clear_stuck_session(session, touch_mode="curated"):
                clear_session()
            print(
                "[TTS/Config] 自定义语料配置无效，已回退到精选音频模式",
                flush=True,
            )
            return "curated"

        if is_official and use_curated_clips:
            write_touch_mode("curated")
            print(
                "[TTS/Config] 官方声线已启用精选音频，跳过语料预热",
                flush=True,
            )
            return "curated"

    if mode == "curated" and is_official and not use_curated_clips and _active_sample_ready():
        write_touch_mode("custom_corpus")
        print(
            "[TTS/Config] 官方声线使用自定义语料，已切换为语料预热模式",
            flush=True,
        )
        return "custom_corpus"

    if _should_clear_stuck_session(session, touch_mode=mode):
        clear_session()
        print("[TTS/Config] 已清理中断的音色工坊会话", flush=True)

    return read_touch_mode()
