import type { CacheStatus } from '../audioCache'
import type { TtsHealth } from '../voiceForgeApi'
import type { TouchFeedbackMode } from '../touchModeSettings'

export type VoiceEngineLoadMode = 'curated' | 'engine' | 'prewarm' | 'realtime'

export interface VoiceEngineLoadRequest {
  title: string
  message: string
  mode: VoiceEngineLoadMode
  sync?: boolean
  expectedTouchMode?: TouchFeedbackMode
  syncMessage?: string
}

export interface LoadTimingState {
  loadStartedAt: number
  sawSyncRunning: boolean
  syncFinishedAt: number | null
  syncRunningSince: number | null
  lastResyncAt: number
  resyncCount: number
  syncJustFinished: boolean
}

export interface LoadEvaluationContext {
  mode: VoiceEngineLoadMode
  expectedTouchMode: TouchFeedbackMode
  health: TtsHealth | null
  cache: CacheStatus | null
  syncMessage?: string
  timing: LoadTimingState
}

export type LoadAbortReason =
  | 'touch_mode_mismatch'
  | 'sync_stuck'
  | 'prewarm_stuck'
  | 'engine_mount_timeout'

export interface LoadTickResult {
  complete: boolean
  message: string
  progress: { done: number; total: number } | null
  abort: LoadAbortReason | null
  requestResync: boolean
}

export interface VoiceEngineLoadStrategy {
  readonly name: VoiceEngineLoadMode
  validatePayload(expectedTouchMode: TouchFeedbackMode): void
  execute(ctx: LoadEvaluationContext): LoadTickResult
}
