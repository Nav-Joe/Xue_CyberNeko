import {
  ENGINE_MOUNT_GRACE_MS,
  PREWARM_STUCK_MS,
  SYNC_STUCK_MS,
  TOUCH_MODE_MISMATCH_ABORT_MS,
  TOUCH_MODE_MISMATCH_GRACE_MS
} from './constants'
import { cacheLooksReadyOnDisk, isPrewarmStillRunning } from './cache-resolver'
import type { LoadAbortReason, LoadEvaluationContext } from './types'

export function shouldAbortWrongTouchMode(ctx: LoadEvaluationContext): boolean {
  const { expectedTouchMode, health, timing } = ctx
  if (!health || health.sync_running || health.touch_mode === expectedTouchMode) {
    return false
  }
  if (timing.syncFinishedAt !== null) {
    if (Date.now() - timing.syncFinishedAt < TOUCH_MODE_MISMATCH_GRACE_MS) {
      return false
    }
    return true
  }
  if (timing.sawSyncRunning) {
    return false
  }
  return Date.now() - timing.loadStartedAt > TOUCH_MODE_MISMATCH_ABORT_MS
}

export function shouldAbortSyncStuck(ctx: LoadEvaluationContext): boolean {
  if (ctx.timing.syncRunningSince === null) {
    return false
  }
  return Date.now() - ctx.timing.syncRunningSince > SYNC_STUCK_MS
}

export function shouldAbortEngineMountWait(ctx: LoadEvaluationContext): boolean {
  const { mode, health, cache, timing } = ctx
  if (mode === 'curated' || health?.sync_running) {
    return false
  }
  if (health?.engine && health.engine_matches_active) {
    return false
  }
  const finishedAt = timing.syncFinishedAt ?? (timing.sawSyncRunning ? null : timing.loadStartedAt)
  if (finishedAt === null) {
    return false
  }
  if (Date.now() - finishedAt < ENGINE_MOUNT_GRACE_MS) {
    return false
  }
  return cacheLooksReadyOnDisk(cache)
}

export function shouldAbortPrewarmStuck(ctx: LoadEvaluationContext): boolean {
  const { mode, health, cache, timing } = ctx
  if (mode !== 'prewarm' || !health || health.sync_running) {
    return false
  }
  if (!timing.sawSyncRunning || timing.syncFinishedAt === null) {
    return false
  }
  if (Date.now() - timing.syncFinishedAt < PREWARM_STUCK_MS) {
    return false
  }
  if (cache?.ready) {
    return false
  }
  if (isPrewarmStillRunning(health, cache)) {
    return false
  }
  return !cache?.building
}

export function resolveSharedAbort(ctx: LoadEvaluationContext): LoadAbortReason | null {
  if (shouldAbortWrongTouchMode(ctx)) {
    return 'touch_mode_mismatch'
  }
  if (shouldAbortSyncStuck(ctx)) {
    return 'sync_stuck'
  }
  if (shouldAbortEngineMountWait(ctx)) {
    return 'engine_mount_timeout'
  }
  return null
}

export function logLoadAbort(ctx: LoadEvaluationContext, reason: LoadAbortReason): void {
  const { mode, expectedTouchMode, health, cache } = ctx
  const base = {
    mode,
    expectedTouchMode,
    touch_mode: health?.touch_mode,
    engine: health?.engine,
    engine_matches_active: health?.engine_matches_active
  }

  if (reason === 'touch_mode_mismatch') {
    console.error('[VoiceEngineLoad] TTS 触摸模式与预期不一致', base)
    return
  }
  if (reason === 'sync_stuck') {
    console.error('[VoiceEngineLoad] sync_running 超时，克隆引擎可能卡住', {
      mode,
      expectedTouchMode,
      touch_mode: health?.touch_mode
    })
    return
  }
  if (reason === 'prewarm_stuck') {
    console.error('[VoiceEngineLoad] 语料预热未完成且长时间无进展', {
      ...base,
      cache_ready: cache?.ready,
      cache_building: cache?.building,
      cache_stale: cache?.stale,
      prewarm_work_total: cache?.prewarm_work_total,
      progress: cache?.progress
    })
    return
  }
  console.error('[VoiceEngineLoad] 同步已结束但克隆引擎未挂载', {
    ...base,
    cache_ready: cache?.ready,
    cache_building: cache?.building,
    cache_message: cache?.message
  })
}
