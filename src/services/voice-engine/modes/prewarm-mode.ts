import type { TouchFeedbackMode } from '../../touchModeSettings'
import { RESYNC_INTERVAL_MS } from '../constants'
import { isPrewarmStillRunning, resolveCorpusPrewarmProgress } from '../cache-resolver'
import type { LoadEvaluationContext, LoadTickResult, VoiceEngineLoadStrategy } from '../types'

const ALLOWED_TOUCH_MODES: TouchFeedbackMode[] = ['custom_corpus', 'curated', 'alt_engine_corpus']

function isPrewarmComplete(ctx: LoadEvaluationContext): boolean {
  const { health, cache, expectedTouchMode } = ctx
  if (!health || health.sync_running) {
    return false
  }

  if (expectedTouchMode === 'curated') {
    if (isPrewarmStillRunning(health, cache)) {
      return false
    }
    if (cache?.building) {
      return false
    }
    const workTotal = cache?.prewarm_work_total ?? 0
    const progressDone = cache?.progress?.done ?? 0
    if (workTotal > 0 && progressDone < workTotal) {
      return false
    }
    return health.touch_mode === 'curated'
  }

  if (health.touch_mode !== expectedTouchMode) {
    return false
  }
  if (!health.engine || !health.engine_matches_active) {
    return false
  }

  if (isPrewarmStillRunning(health, cache)) {
    return false
  }
  if (cache?.building) {
    return false
  }
  if (cache?.stale) {
    return false
  }

  const workTotal = cache?.prewarm_work_total ?? 0
  const progressDone = cache?.progress?.done ?? 0
  if (workTotal > 0 && progressDone < workTotal) {
    return false
  }
  if (cache?.ready && !cache.stale) {
    return true
  }

  // 同步已结束且进度已满，但 cache.ready 未及时翻转（竞态 / manifest 延迟）
  if (workTotal > 0 && progressDone >= workTotal) {
    return true
  }

  return Boolean(cache?.ready)
}

function buildPrewarmMessage(ctx: LoadEvaluationContext): string {
  const { health, cache, syncMessage } = ctx

  if (health?.sync_running) {
    return syncMessage ?? '正在预热语料库喵~'
  }

  const corpusProgress = resolveCorpusPrewarmProgress(health, cache)
  if (corpusProgress) {
    return `正在预热语料缓存 ${corpusProgress.done}/${corpusProgress.total}…`
  }

  if (health?.engine && health.engine_matches_active) {
    return '克隆引擎已就绪'
  }

  return '正在连接语音服务…'
}

export function evaluatePrewarmResyncNeed(ctx: LoadEvaluationContext): boolean {
  const { health, cache, timing } = ctx
  if (!health || health.sync_running) {
    return false
  }
  if (isPrewarmStillRunning(health, cache)) {
    return false
  }
  if (cache?.ready || cache?.building) {
    return false
  }
  return Date.now() - timing.lastResyncAt > RESYNC_INTERVAL_MS
}

export const prewarmStrategy: VoiceEngineLoadStrategy = {
  name: 'prewarm',

  validatePayload(expectedTouchMode: TouchFeedbackMode): void {
    if (!ALLOWED_TOUCH_MODES.includes(expectedTouchMode)) {
      throw new Error(`prewarm 不支持 expectedTouchMode=${expectedTouchMode}`)
    }
  },

  execute(ctx: LoadEvaluationContext): LoadTickResult {
    const progress = resolveCorpusPrewarmProgress(ctx.health, ctx.cache)
    return {
      complete: isPrewarmComplete(ctx),
      message: buildPrewarmMessage(ctx),
      progress,
      abort: null,
      requestResync: evaluatePrewarmResyncNeed(ctx)
    }
  }
}
