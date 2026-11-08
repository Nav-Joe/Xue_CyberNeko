/** 云端 TTS 配置与 IPC 载荷（对齐 CONTRACT.md） */

export type TtsBackend = 'local' | 'qwen' | 'seed' | 'edge'

/** 声音复刻（VC）与声音设计（VD）；合成必须用对应 model */
export type QwenVoiceKind = 'vc' | 'vd'

export type QwenCloudVoice = {
  /** 本地列表 id（非百炼 voice） */
  id: string
  kind: QwenVoiceKind
  name: string
  /** 百炼返回的 voice */
  voiceId: string
  createdAt: number
}

export type QwenCloudFields = {
  baseUrl: string
  vcModel: string
  vdModel: string
  voices: QwenCloudVoice[]
  /** 指向 voices[].id；空表示尚未选中 */
  activeVoiceLocalId: string
  /** 内存明文；落盘走 apiKey / apiKeyEnc */
  apiKey: string
  secretSave: boolean
}

export type SeedVoice = {
  id: string
  name: string
  /** 控制台音色 ID，请求里的 speaker */
  speaker: string
  createdAt: number
}

export type SeedCloudFields = {
  baseUrl: string
  /** X-Api-Resource-Id，例如 seed-tts-2.0 或 seed-icl-2.0 */
  resourceId: string
  voices: SeedVoice[]
  activeVoiceLocalId: string
  apiKey: string
  secretSave: boolean
}

export type TtsCloudConfig = {
  ttsBackend: TtsBackend
  qwen: QwenCloudFields
  seed: SeedCloudFields
  edge: EdgeCloudFields
}

export type QwenCloudVoiceView = QwenCloudVoice

export type TtsCloudConfigView = {
  ttsBackend: TtsBackend
  qwen: {
    baseUrl: string
    vcModel: string
    vdModel: string
    voices: QwenCloudVoiceView[]
    activeVoiceLocalId: string
    /** 当前音色 kind；无 active 时为 null */
    activeKind: QwenVoiceKind | null
    /**
     * 兼容字段：当前音色对应的合成 model（按 kind）。
     * 无 active 时回落 vcModel。
     */
    model: string
    /** 兼容字段：当前音色的百炼 voiceId */
    voiceId: string
    secretSave: boolean
    hasApiKey: boolean
    apiKey?: string
  }
  seed: {
    baseUrl: string
    resourceId: string
    voices: Array<{ id: string; name: string; speaker: string; createdAt: number }>
    activeVoiceLocalId: string
    secretSave: boolean
    hasApiKey: boolean
    apiKey?: string
  }
  edge: {
    baseUrl: string
    voices: Array<{ id: string; name: string; speaker: string; createdAt: number }>
    activeVoiceLocalId: string
  }
}

export type TtsCloudConfigPatch = {
  ttsBackend?: TtsBackend
  qwen?: {
    baseUrl?: string
    vcModel?: string
    vdModel?: string
    voices?: QwenCloudVoice[]
    activeVoiceLocalId?: string
    /**
     * 兼容：写入 vcModel（官方克隆仍绑 VC）。
     * 新代码请用 vcModel / vdModel。
     */
    model?: string
    /**
     * 兼容：写入/更新一条 VC 音色并设为 active（官方样本云克隆）。
     */
    voiceId?: string
    /** 传入则更新；空串表示清空 */
    apiKey?: string
    secretSave?: boolean
  }
  seed?: {
    baseUrl?: string
    resourceId?: string
    voices?: SeedVoice[]
    activeVoiceLocalId?: string
    apiKey?: string
    secretSave?: boolean
  }
  edge?: {
    baseUrl?: string
    voices?: EdgeVoice[]
    activeVoiceLocalId?: string
  }
}

export type TtsCloudSynthOk = {
  ok: true
  audio: ArrayBuffer
  mime: string
}

export type TtsCloudSynthErr = {
  ok: false
  detail: string
}

export type TtsCloudSynthResult = TtsCloudSynthOk | TtsCloudSynthErr

/** 磁盘形态；旧版可能带单 model/voiceId 或 fish/minimax */
export type TtsCloudConfigDisk = {
  ttsBackend?: string
  qwen?: {
    baseUrl?: string
    vcModel?: string
    vdModel?: string
    voices?: unknown
    activeVoiceLocalId?: string
    /** @deprecated 迁入 vcModel + voices */
    model?: string
    /** @deprecated 迁入 voices */
    voiceId?: string
    apiKey?: string
    apiKeyEnc?: string
    secretSave?: boolean
  }
  /** @deprecated 旧 Fish；读时不映射 */
  fish?: Record<string, unknown>
  /** @deprecated 旧 MiniMax；读时不映射 */
  minimax?: Record<string, unknown>
  seed?: {
    baseUrl?: string
    resourceId?: string
    voices?: unknown
    activeVoiceLocalId?: string
    apiKey?: string
    apiKeyEnc?: string
    secretSave?: boolean
  }
  edge?: {
    baseUrl?: string
    voices?: unknown
    activeVoiceLocalId?: string
  }
}

export const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com'

/** VC 克隆 / 合成默认快照 */
export const DEFAULT_QWEN_VC_MODEL = 'qwen3-tts-vc-2026-01-22'

/** VD 设计 / 合成默认快照 */
export const DEFAULT_QWEN_VD_MODEL = 'qwen3-tts-vd-2026-01-26'

export const DEFAULT_SEED_BASE_URL = 'https://openspeech.bytedance.com'
export const DEFAULT_SEED_RESOURCE_ID = 'seed-tts-2.0'

export const DEFAULT_EDGE_WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'

export const DEFAULT_EDGE_VOICES: EdgeVoice[] = [
  { id: 'edge-xiaoxiao', name: '晓晓', speaker: 'zh-CN-XiaoxiaoNeural', createdAt: 0 },
  { id: 'edge-yunxi', name: '云希', speaker: 'zh-CN-YunxiNeural', createdAt: 0 },
  { id: 'edge-xiaoyi', name: '晓伊', speaker: 'zh-CN-XiaoyiNeural', createdAt: 0 },
  { id: 'edge-yunjian', name: '云健', speaker: 'zh-CN-YunjianNeural', createdAt: 0 }
]

export type EdgeVoice = {
  id: string
  name: string
  /** Edge 音色名，例如 zh-CN-XiaoxiaoNeural */
  speaker: string
  createdAt: number
}

export type EdgeCloudFields = {
  baseUrl: string
  voices: EdgeVoice[]
  activeVoiceLocalId: string
}

export const PREVIEW_TEXT_MAX_CHARS = 200

/** 云端触摸预热缓存根目录名（与本地 voice_forge touch_cache 分开） */
export const TTS_CLOUD_CACHE_DIR_NAME = 'tts-cloud-cache'
