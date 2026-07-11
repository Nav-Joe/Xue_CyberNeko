import { fetchCacheStatus, type CacheStatus } from '../services/audioCache'
import { fetchTtsHealth, type TtsHealth, type VoiceForgeStatus } from '../services/voiceForgeApi'
import { getTouchFeedbackMode } from '../services/touchModeSettings'
import type { Ref } from 'vue'

export type CreateVoiceBootAction =
  | { kind: 'generating'; resume: boolean }
  | { kind: 'prewarming' }
  | { kind: 'review'; status: VoiceForgeStatus }
  | { kind: 'none' }

export function resolveCreateVoiceBoot(vfStatus: VoiceForgeStatus): CreateVoiceBootAction {
  if (vfStatus.flow !== 'create_voice') return { kind: 'none' }
  if (vfStatus.phase === 'pending_restart' || vfStatus.phase === 'generating') {
    return { kind: 'generating', resume: !vfStatus.reference_ready }
  }
  if (vfStatus.phase === 'prewarming') return { kind: 'prewarming' }
  if (vfStatus.review_pending && vfStatus.reference_ready) {
    return { kind: 'review', status: vfStatus }
  }
  return { kind: 'none' }
}

export function isPrewarmStillRunning(
  health: TtsHealth | null,
  cache: CacheStatus | null
): boolean {
  return Boolean(
    health?.sync_running || health?.prewarm_active || cache?.prewarm_active || cache?.building
  )
}

export function applyPrewarmUi(
  cache: CacheStatus | null,
  prewarmStillRunning: boolean,
  message: Ref<string>,
  progress: Ref<{ done: number; total: number } | null>
): void {
  if (cache?.building && cache.progress.total > 0) {
    progress.value = cache.progress
    message.value = `正在预热触摸台词 ${cache.progress.done}/${cache.progress.total}…`
  } else if (cache?.message?.includes('正在预热语料库')) {
    message.value = cache.message
    progress.value = null
  } else if (prewarmStillRunning) {
    message.value = '正在预热语料库喵~'
    progress.value = null
  } else {
    progress.value = null
  }
}

export type PrewarmExit = 'continue' | 'finish' | 'finish-warn'

export function resolvePrewarmExit(
  vfStatus: VoiceForgeStatus | null,
  cache: CacheStatus | null,
  prewarmStillRunning: boolean
): PrewarmExit {
  const sessionDone =
    !vfStatus?.flow || vfStatus.phase === 'completed' || vfStatus.phase === 'cancelled'
  const cacheReady = Boolean(
    cache?.ready && !cache?.building && !cache?.stale && !prewarmStillRunning
  )
  const cacheSkipped = Boolean(
    cache?.message && !cache?.building && !cache?.stale && !prewarmStillRunning
  )

  if (sessionDone && (cacheReady || cacheSkipped || getTouchFeedbackMode() === 'curated')) {
    return 'finish'
  }
  if (vfStatus?.phase === 'prewarming' && cacheReady) {
    return 'finish'
  }
  if (
    sessionDone &&
    getTouchFeedbackMode() === 'custom_corpus' &&
    cache?.touch_mode === 'curated' &&
    !cache?.building
  ) {
    return 'finish-warn'
  }
  return 'continue'
}

export async function fetchPrewarmSnapshot(): Promise<{
  cache: CacheStatus | null
  health: TtsHealth | null
  prewarmStillRunning: boolean
}> {
  const [cache, health] = await Promise.all([fetchCacheStatus(), fetchTtsHealth()])
  return { cache, health, prewarmStillRunning: isPrewarmStillRunning(health, cache) }
}
