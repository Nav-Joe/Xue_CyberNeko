import type { CacheStatus } from '../audioCache'
import type { TtsHealth } from '../voiceForgeApi'

export function cacheLooksReadyOnDisk(cache: CacheStatus | null): boolean {
  if (!cache) {
    return false
  }
  if (cache.ready && !cache.building) {
    return true
  }
  return Boolean(
    cache.message?.includes('已有预热缓存') ||
      cache.message?.includes('已有有效缓存') ||
      cache.message?.includes('等待 TTS 引擎挂载')
  )
}

export function isPrewarmStillRunning(health: TtsHealth | null, cache: CacheStatus | null): boolean {
  if (health?.sync_running || health?.prewarm_active) {
    return true
  }
  if (cache?.prewarm_active || cache?.building) {
    return true
  }
  return false
}

/** 仅 prewarm 使用 determinate 进度；其它 mode 用 indeterminate。 */
export function resolveCorpusPrewarmProgress(
  health: TtsHealth | null,
  cache: CacheStatus | null
): { done: number; total: number } | null {
  if (!cache) {
    return null
  }

  const done = cache.progress?.done ?? 0
  const workTotal = cache.prewarm_work_total ?? 0
  const reportedTotal = cache.progress?.total ?? 0

  // 克隆引擎挂载阶段（尚未开始合成 wav）：转圈，避免 0/全库 误导
  if (health?.sync_running && done === 0) {
    return null
  }

  if (!cache.building) {
    return null
  }

  let total = workTotal > 0 ? workTotal : reportedTotal
  if (workTotal > 0 && reportedTotal > workTotal) {
    total = workTotal
  }
  if (total <= 0) {
    return null
  }

  return { done: Math.min(done, total), total }
}
