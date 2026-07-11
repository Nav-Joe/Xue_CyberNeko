import type { BootStep } from '../constants/petBoot'
import type { VoiceForgeStatus } from '../services/voiceForgeApi'

/** 细粒度启动阶段（与原 PetApp 一致） */
export type BootPhase = 'checking' | 'generating' | 'review' | 'prewarming' | 'ready'

/** 启动流程类型 */
export type BootFlow = 'create' | 'corpus' | null

/** 对外简化状态机 */
export type AppBootStatus = 'idle' | 'loading' | 'ready' | 'error'

/** overlay 模式（供 useOverlayManager） */
export type OverlayMode = 'boot' | 'engineLoad' | 'review' | 'menu' | 'pet'

export interface OverlaySpec {
  width: number
  height: number
}

export interface BootProgress {
  done: number
  total: number
}

/** useAppBoot 对外只读视图（子组件 props 用） */
export interface BootViewState {
  phase: BootPhase
  flow: BootFlow
  message: string
  progress: BootProgress | null
  reviewStatus: VoiceForgeStatus | null
  status: AppBootStatus
  showBootOverlay: boolean
  bootSteps: BootStep[]
  currentStepId: string
  inReview: boolean
}
