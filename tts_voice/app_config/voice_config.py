"""
双端磁盘/API 契约模型。

对齐 electron/main/config/types/runtime-config.ts；
P3：收紧枚举与必填字段；磁盘解析仍 extra="ignore"。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TouchFeedbackMode = Literal["curated", "custom_corpus", "alt_engine_corpus"]
VoiceForgeSessionPhase = Literal[
    "pending_restart",
    "generating",
    "awaiting_review",
    "prewarming",
    "completed",
    "cancelled",
]
VoiceForgeSessionFlow = Literal["create_voice"]

OFFICIAL_SAMPLE_ID = "default_sample"
ALT_ENGINE_PREWARM_TARGET = "__alt_engine__"


class VoiceSampleProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    folderId: str
    displayName: str
    kind: Literal["official", "custom"] | None = None
    pending: bool | None = None

    @field_validator("folderId")
    @classmethod
    def folder_id_non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("folderId must be non-empty")
        return value


class VoiceForgeJson(BaseModel):
    """`.runtime/voice-forge.json`"""

    model_config = ConfigDict(extra="ignore")

    instruct: str | None = None
    activeSample: VoiceSampleProfile | None = None
    officialUseCuratedClips: bool | None = None


class VoiceForgeSession(BaseModel):
    """`.runtime/voice-forge-session.json`"""

    model_config = ConfigDict(extra="ignore")

    version: int | None = None
    flow: VoiceForgeSessionFlow | None = None
    phase: VoiceForgeSessionPhase | None = None
    folderId: str | None = None
    displayName: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    source: Literal["upload", "voice_design"] | None = None

    @field_validator("version")
    @classmethod
    def version_positive(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("version must be a positive integer")
        return value


class CorpusPrewarmFlag(BaseModel):
    """`.runtime/corpus-prewarm.flag` 单行"""

    model_config = ConfigDict(extra="ignore")

    target: str | None = None


class TouchModeSyncResponse(BaseModel):
    """`POST /touch-mode/sync` 响应形状（P2b 用）"""

    model_config = ConfigDict(extra="ignore")

    ok: bool = True
    touch_mode: str = ""
    prewarm: bool = False
    changed: bool = False


class TtsRequest(BaseModel):
    """`POST /tts` 请求体（P2d）"""

    text: str = Field(..., min_length=1, max_length=200)
    speaker_id: int = 0
    seed: int | None = None
    mode: str = "default"  # chat：单句独立推理，不参与 micro-batch
    order: int | None = Field(default=None, ge=0, description="聊天句序，从 0 递增；串行 GPU 按序推理")
    parallel_lanes: int = Field(
        default=0,
        ge=0,
        le=4,
        description="聊天并行并路 2-4；0 表示串行",
    )


class TtsBatchRequest(BaseModel):
    """`POST /tts/batch` 请求体：一次合成多句（最多 5 句）"""

    texts: list[str] = Field(..., min_length=1, max_length=5)
    speaker_id: int = 0
    seed: int | None = None

    @field_validator("texts")
    @classmethod
    def validate_texts(cls, value: list[str]) -> list[str]:
        cleaned = [text.strip() for text in value if text.strip()]
        if not cleaned:
            raise ValueError("texts 不能为空")
        if len(cleaned) > 5:
            raise ValueError("texts 最多 5 句")
        for text in cleaned:
            if len(text) > 200:
                raise ValueError("单句 text 过长")
        return cleaned


class VoiceForgeRejectRequest(BaseModel):
    """`POST /voice-forge/reject` 请求体（P2c）"""

    action: str = Field(..., pattern="^(regenerate|skip)$")


class TtsHealthPayload(BaseModel):
    """`GET /health` 响应核心字段（P2a 用）"""

    model_config = ConfigDict(extra="ignore")

    status: str | None = None
    backend: str | None = None
    configured_engine: str | None = None
    voice_forge_supported: bool | None = None
    touch_mode: str | None = None
    engine: bool | None = None
    ready: bool | None = None
    voice_forge_review_pending: bool | None = None
    sync_running: bool | None = None
    prewarm_active: bool | None = None
    engine_matches_active: bool | None = None
    sample_folder_id: str | None = None


RUNTIME_ARTIFACTS = {
    "touch_mode": "touch-mode.env",
    "custom_corpus": "corpus.custom.json",
    "voice_forge": "voice-forge.json",
    "voice_forge_session": "voice-forge-session.json",
    "corpus_prewarm": "corpus-prewarm.flag",
    "realtime_inference": "realtime-inference.env",
    "regenerate_model": "regenerate-voice-model.flag",
}

__all__ = [
    "ALT_ENGINE_PREWARM_TARGET",
    "CorpusPrewarmFlag",
    "OFFICIAL_SAMPLE_ID",
    "RUNTIME_ARTIFACTS",
    "TouchFeedbackMode",
    "TouchModeSyncResponse",
    "TtsHealthPayload",
    "TtsRequest",
    "VoiceForgeJson",
    "VoiceForgeRejectRequest",
    "VoiceForgeSession",
    "VoiceForgeSessionFlow",
    "VoiceForgeSessionPhase",
    "VoiceSampleProfile",
]
