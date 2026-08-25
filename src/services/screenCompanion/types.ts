/**
 * 屏幕偷窥 IPC 类型（与主进程 screenCompanion 语义对齐）。
 */
export type ScreenCompanionObservation = {
  ts: string
  summary: string
  sceneHint?: string
  skipped?:
    | 'disabled'
    | 'paused'
    | 'privacy_filtered'
    | 'vision_unconfigured'
    | 'vision_failed'
    | 'capture_failed'
  usableForPrompt?: boolean
}

export type ScreenCompanionConfigView = {
  enabled: boolean
  pausedUntilMs: number | null
  processBlacklist: string[]
  intervalSec: number
  visionBaseUrl: string
  visionModel: string
  hasVisionApiKey: boolean
  /** 默认关；开则不向渲染回传明文 Key */
  visionApiKeySecretSave: boolean
  /** 仅非私密保存时可能有值 */
  visionApiKey?: string
}

export type ScreenCompanionSessionEvent = {
  sessionActive: boolean
  playingGameName: string | null
  reason: string
  ts: number
}

export type ScreenCompanionNarrateEvent = {
  text: string
  gameName: string
  ts: number
}

export type ScreenCompanionElectronApi = {
  screenCompanionGetStatus: () => Promise<
    | {
        ok: true
        enabled: boolean
        paused: boolean
        pausedUntilMs: number | null
        hasVisionApiKey: boolean
        visionConfigured: boolean
        latestObservation: ScreenCompanionObservation | null
        schedulerRunning: boolean
        sessionActive: boolean
        playingGameName: string | null
        lastObservedAtMs: number | null
        lastNarratedAtMs: number | null
        nextObserveAtMs: number | null
      }
    | { ok: false; detail: string }
  >
  screenCompanionReadConfig: () => Promise<
    { ok: true; config: ScreenCompanionConfigView } | { ok: false; detail: string }
  >
  screenCompanionWriteConfig: (
    payload: ScreenCompanionConfigView & {
      visionApiKey?: string
      clearVisionApiKey?: boolean
    }
  ) => Promise<
    | { ok: true; config: ScreenCompanionConfigView }
    | { ok: false; detail: string }
  >
  screenCompanionObserveOnce: () => Promise<
    | {
        ok: true
        observation: ScreenCompanionObservation
        captureMs?: number
        encodeMs?: number
        visionMs?: number
        totalObserveMs: number
      }
    | { ok: false; detail: string }
  >
  screenCompanionOnSession: (listener: (event: ScreenCompanionSessionEvent) => void) => () => void
  screenCompanionOnNarrate: (listener: (event: ScreenCompanionNarrateEvent) => void) => () => void
  screenCompanionNotifyNarrateDone: (payload: { ts: number; ok?: boolean }) => Promise<{ ok: true } | { ok: false }>
}
