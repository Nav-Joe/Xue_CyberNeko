/**
 * Steam 游戏检测与看屏观察的对外类型。
 */

export type SteamPlayingStatus =
  | { playing: false }
  | {
      playing: true
      gameName: string
      gameRoot: string
    }

export type SteamGameRoot = {
  gameName: string
  gameRoot: string
}

export type SteamGateDeps = {
  findSteamRoot: () => string | null
  listGameRoots: (steamRoot: string) => SteamGameRoot[]
  listProcessExecutablePaths: () => Promise<string[]>
}

export type ScreenObservationSkipReason =
  | 'disabled'
  | 'paused'
  | 'privacy_filtered'
  | 'vision_unconfigured'
  | 'vision_failed'
  | 'capture_failed'

export type ScreenObservation = {
  ts: string
  summary: string
  sceneHint?: string
  skipped?: ScreenObservationSkipReason
  /**
   * 是否适合拿去写旁白。失败或因隐私跳过时为 false，避免把失败提示塞进角色上下文。
   * 未填时：只要没有 skipped，就当可用。
   */
  usableForPrompt?: boolean
}

export type VisionLlmConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

/** 陪玩旁白 TTS 推理设备：默认 CPU，避免占满游戏显卡；轻量游戏可切 GPU。 */
export type CompanionTtsDevice = 'cpu' | 'gpu'

export type ScreenCompanionConfig = {
  enabled: boolean
  pausedUntilMs: number | null
  processBlacklist: string[]
  /** 游戏会话内两次观察的最小间隔（秒）；默认 90 */
  intervalSec: number
  /** 旁白 TTS 推理设备；默认 cpu */
  companionTtsDevice: CompanionTtsDevice
  /**
   * 默认关（只有明确为 true 才开）：关着时设置页可回填 Key 方便改；
   * 开着时设置页只显示「已配置」，不把明文 Key 传给渲染进程。口径与聊天 API Key 私密保存一致。
   */
  visionApiKeySecretSave: boolean
  vision: VisionLlmConfig
}

export type ScreenCompanionConfigView = {
  enabled: boolean
  pausedUntilMs: number | null
  processBlacklist: string[]
  intervalSec: number
  companionTtsDevice: CompanionTtsDevice
  visionBaseUrl: string
  visionModel: string
  hasVisionApiKey: boolean
  visionApiKeySecretSave: boolean
  /** 仅在「非私密保存」时回传，供密码框编辑 */
  visionApiKey?: string
}

export type ScreenCompanionStatus = {
  enabled: boolean
  paused: boolean
  pausedUntilMs: number | null
  hasVisionApiKey: boolean
  visionConfigured: boolean
  latestObservation: ScreenObservation | null
  /** 调度器是否在跑 */
  schedulerRunning: boolean
  sessionActive: boolean
  playingGameName: string | null
  lastObservedAtMs: number | null
  nextObserveAtMs: number | null
  lastNarratedAtMs: number | null
}
