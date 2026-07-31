/** 欲望快照类型（与 desire_states 对齐；纯类型，读写在 store） */

export type DesireLifecycleState =
  | 'active'
  | 'urgent'
  | 'fulfilled'
  | 'abandoned'
  | 'replaced'

export type DesireTurnOutcome = 'ignored' | 'neutral' | 'advanced' | 'fulfilled' | 'abandon'

export type DesirePatienceStage = 'calm' | 'restless' | 'urgent'

export type DesireSnapshot = {
  id: string
  name: string
  description: string
  intensity: number
  patienceMax: number
  patienceRemaining: number
  state: DesireLifecycleState
  decayRate: number
  protectionTurnsRemaining: number
  createdAt: number
  updatedAt: number
  lastTickAt: number
  lastInteractionAt: number
  lastMentionedAt: number | null
  deadline: number | null
}

export const DESIRE_REUNION_LIGHT_MS = 12 * 60 * 60 * 1000
export const DESIRE_REUNION_STRONG_MS = 3 * 24 * 60 * 60 * 1000
export const DESIRE_PROTECTION_TURNS = 3
export const DESIRE_PROMPT_TOP_N = 3

export const DESIRE_DELTA = {
  ignored: -3,
  neutral: -1,
  advanced: 5,
  ignoredProtected: -0.5
} as const
