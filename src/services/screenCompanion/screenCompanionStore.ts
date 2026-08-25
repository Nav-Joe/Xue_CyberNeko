import type {
  ScreenCompanionConfigView,
  ScreenCompanionObservation
} from './types'

const INTERVAL_MIN = 30
const INTERVAL_MAX = 600

export type ScreenCompanionWritePayload = ScreenCompanionConfigView & {
  visionApiKey?: string
  clearVisionApiKey?: boolean
}

/** IPC 前脱响应式代理，避免 structured clone 报 An object could not be cloned */
export function cloneScreenCompanionConfig<T extends ScreenCompanionWritePayload>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

export function clampIntervalSecUi(raw: number): number {
  if (!Number.isFinite(raw)) return 90
  return Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.floor(raw)))
}

export async function loadScreenCompanionConfig(): Promise<ScreenCompanionConfigView> {
  if (!window.electronAPI?.screenCompanionReadConfig) {
    throw new Error('当前环境不支持屏幕偷窥配置')
  }
  const res = await window.electronAPI.screenCompanionReadConfig()
  if (!res.ok) throw new Error(res.detail || 'read_failed')
  return res.config
}

export async function saveScreenCompanionConfig(
  payload: ScreenCompanionWritePayload
): Promise<ScreenCompanionConfigView> {
  if (!window.electronAPI?.screenCompanionWriteConfig) {
    throw new Error('当前环境不支持屏幕偷窥配置')
  }
  const res = await window.electronAPI.screenCompanionWriteConfig(cloneScreenCompanionConfig(payload))
  if (!res.ok) {
    if (res.detail === 'tts_required') {
      throw new Error('须先在「对话语音」中开启对话 TTS，才能打开屏幕偷窥')
    }
    throw new Error(res.detail || 'write_failed')
  }
  return res.config
}

export type ScreenCompanionRuntimeStatus = {
  enabled: boolean
  paused: boolean
  pausedUntilMs: number | null
  visionConfigured: boolean
  schedulerRunning: boolean
  sessionActive: boolean
  playingGameName: string | null
  lastObservedAtMs: number | null
  lastNarratedAtMs: number | null
  nextObserveAtMs: number | null
  latestObservation: ScreenCompanionObservation | null
}

export async function fetchScreenCompanionStatus(): Promise<ScreenCompanionRuntimeStatus | null> {
  if (!window.electronAPI?.screenCompanionGetStatus) return null
  const res = await window.electronAPI.screenCompanionGetStatus()
  if (!res.ok) return null
  return {
    enabled: res.enabled,
    paused: res.paused,
    pausedUntilMs: res.pausedUntilMs,
    visionConfigured: res.visionConfigured,
    schedulerRunning: res.schedulerRunning,
    sessionActive: res.sessionActive,
    playingGameName: res.playingGameName,
    lastObservedAtMs: res.lastObservedAtMs,
    lastNarratedAtMs: res.lastNarratedAtMs,
    nextObserveAtMs: res.nextObserveAtMs,
    latestObservation: res.latestObservation
  }
}

/** TTS 关掉时：若屏幕偷窥总开关开着，一并关掉 */
export async function disableScreenCompanionIfEnabled(): Promise<boolean> {
  try {
    const config = await loadScreenCompanionConfig()
    if (!config.enabled) return false
    await saveScreenCompanionConfig({ ...config, enabled: false })
    return true
  } catch {
    return false
  }
}

export function formatCompanionPauseUntil(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatCompanionRelativeSec(untilMs: number | null, nowMs = Date.now()): string {
  if (untilMs == null || !Number.isFinite(untilMs)) return '—'
  const delta = Math.max(0, Math.ceil((untilMs - nowMs) / 1000))
  if (delta <= 0) return '即将'
  if (delta < 60) return `约 ${delta} 秒`
  return `约 ${Math.ceil(delta / 60)} 分钟`
}
