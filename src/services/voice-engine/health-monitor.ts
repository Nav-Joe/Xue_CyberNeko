import { fetchCacheStatus, type CacheStatus } from '../audioCache'
import { fetchTtsHealth, syncTouchModeAfterSwitch, type TtsHealth } from '../voiceForgeApi'
import {
  MAX_RESYNC_ATTEMPTS,
  POST_SYNC_GRACE_MS,
  RESYNC_COOLDOWN_MS,
  RESYNC_INTERVAL_MS
} from './constants'
import { isPrewarmStillRunning } from './cache-resolver'
import type { LoadEvaluationContext, LoadTimingState, VoiceEngineLoadMode } from './types'
import type { TouchFeedbackMode } from '../touchModeSettings'

export class LoadTimingTracker {
  readonly loadStartedAt = Date.now()
  sawSyncRunning = false
  syncFinishedAt: number | null = null
  syncRunningSince: number | null = null
  lastResyncAt = 0
  resyncCount = 0
  syncJustFinished = false

  private lastSyncRunning = false

  /** 每轮 poll 最先调用：检测 sync 边沿 + 更新计时 */
  observeHealth(health: TtsHealth | null): void {
    const syncRunning = Boolean(health?.sync_running)
    this.syncJustFinished = this.lastSyncRunning && !syncRunning
    this.lastSyncRunning = syncRunning

    if (syncRunning) {
      this.sawSyncRunning = true
      if (this.syncRunningSince === null) {
        this.syncRunningSince = Date.now()
      }
    } else {
      this.syncRunningSince = null
      if (this.sawSyncRunning && this.syncFinishedAt === null) {
        this.syncFinishedAt = Date.now()
      }
    }
  }

  resetAfterResync(): void {
    this.sawSyncRunning = false
    this.syncFinishedAt = null
    this.syncRunningSince = null
    this.syncJustFinished = false
    this.lastSyncRunning = false
  }

  markResync(): void {
    this.lastResyncAt = Date.now()
    this.resyncCount += 1
  }

  snapshot(): LoadTimingState {
    return {
      loadStartedAt: this.loadStartedAt,
      sawSyncRunning: this.sawSyncRunning,
      syncFinishedAt: this.syncFinishedAt,
      syncRunningSince: this.syncRunningSince,
      lastResyncAt: this.lastResyncAt,
      resyncCount: this.resyncCount,
      syncJustFinished: this.syncJustFinished
    }
  }
}

export async function pollHealthAndCache(): Promise<{
  health: TtsHealth | null
  cache: CacheStatus | null
}> {
  const [health, cache] = await Promise.all([fetchTtsHealth(), fetchCacheStatus()])
  return { health, cache }
}

function needsTouchModeResync(
  expectedTouchMode: TouchFeedbackMode,
  health: TtsHealth | null,
  lastResyncAt: number
): boolean {
  return Boolean(
    health &&
      !health.sync_running &&
      health.touch_mode !== expectedTouchMode &&
      Date.now() - lastResyncAt > RESYNC_INTERVAL_MS
  )
}

function needsPrewarmResync(
  mode: VoiceEngineLoadMode,
  health: TtsHealth | null,
  cache: CacheStatus | null,
  lastResyncAt: number
): boolean {
  return Boolean(
    mode === 'prewarm' &&
      health &&
      !health.sync_running &&
      !isPrewarmStillRunning(health, cache) &&
      !cache?.ready &&
      !cache?.building &&
      Date.now() - lastResyncAt > RESYNC_INTERVAL_MS
  )
}

function withinPostSyncGrace(timing: LoadTimingTracker): boolean {
  if (!timing.syncJustFinished || timing.syncFinishedAt === null) {
    return false
  }
  return Date.now() - timing.syncFinishedAt < POST_SYNC_GRACE_MS
}

/**
 * 三道 resync 保险 + 触发 /touch-mode/sync。
 * @returns true 表示本轮刚 resync，调用方应 continue 跳过后续 complete/abort 判定。
 */
export async function maybeResync(
  ctx: LoadEvaluationContext,
  timing: LoadTimingTracker
): Promise<boolean> {
  if (timing.resyncCount >= MAX_RESYNC_ATTEMPTS) {
    return false
  }

  if (timing.lastResyncAt > 0 && Date.now() - timing.lastResyncAt < RESYNC_COOLDOWN_MS) {
    return false
  }

  if (withinPostSyncGrace(timing)) {
    return false
  }

  const touchResync = needsTouchModeResync(
    ctx.expectedTouchMode,
    ctx.health,
    timing.lastResyncAt
  )
  const prewarmResync = needsPrewarmResync(ctx.mode, ctx.health, ctx.cache, timing.lastResyncAt)

  if (!touchResync && !prewarmResync) {
    return false
  }

  timing.markResync()
  const resynced = await syncTouchModeAfterSwitch()
  if (resynced.ok && resynced.touch_mode === ctx.expectedTouchMode) {
    timing.resetAfterResync()
  }
  return true
}
