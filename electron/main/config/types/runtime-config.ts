import type { CorpusData } from '../../../../src/types/corpus'

/** 与 touch_mode_config.py VALID_TOUCH_MODES 一致 */
export type TouchFeedbackMode = 'curated' | 'custom_corpus' | 'alt_engine_corpus'

export const OFFICIAL_SAMPLE_ID = 'default_sample' as const
export const OFFICIAL_SAMPLE_LABEL = '默认配置' as const

/** 与 voice_forge_session.py PHASE_* 常量一一对应 */
export type VoiceForgeSessionPhase =
  | 'pending_restart'
  | 'generating'
  | 'awaiting_review'
  | 'prewarming'
  | 'completed'
  | 'cancelled'

export type VoiceForgeSessionFlow = 'create_voice'

export interface VoiceSampleProfile {
  folderId: string
  displayName: string
  kind?: 'official' | 'custom'
  pending?: boolean
}

export interface VoiceSampleEntry {
  folderId: string
  displayName: string
  kind: 'official' | 'custom'
  hasReference: boolean
}

/** .runtime/voice-forge-session.json */
export interface VoiceForgeSession {
  version: number
  flow: VoiceForgeSessionFlow | null
  phase: VoiceForgeSessionPhase
  folderId: string
  displayName: string
  createdAt: string
  updatedAt: string
  source?: 'upload' | 'voice_design'
}

/** .runtime/voice-forge.json（Python: read_voice_forge_config） */
export interface VoiceForgeJson {
  instruct?: string
  activeSample?: VoiceSampleProfile
  officialUseCuratedClips?: boolean
}

/** readTouchConfig() 返回值 */
export interface TouchConfigView {
  mode: TouchFeedbackMode
  corpus: CorpusData
}

/** readVoiceForgeConfig() 聚合视图 */
export interface VoiceForgeRuntimeView {
  mode: TouchFeedbackMode
  corpus: CorpusData
  instruct: string
  activeSample: VoiceSampleProfile | null
  officialUseCuratedClips: boolean
}

export type CorpusPrewarmResult = VoiceSampleProfile & {
  /** 未切换当前桌宠使用的激活声线/触摸模式（仅更新目标目录语料快照） */
  runtimeUnchanged: boolean
  touchMode: TouchFeedbackMode
}

/** 双端 flag 路径契约（CONTRACT.md 与 paths.ts 共用） */
export const RUNTIME_ARTIFACTS = {
  touchMode: 'touch-mode.env',
  customCorpus: 'corpus.custom.json',
  voiceForge: 'voice-forge.json',
  voiceForgeSession: 'voice-forge-session.json',
  corpusPrewarm: 'corpus-prewarm.flag',
  realtimeInference: 'realtime-inference.env',
  regenerateModel: 'regenerate-voice-model.flag',
  experimentalUpload: 'experimental-voice-upload.json'
} as const
