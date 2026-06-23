import { fetchCacheStatus, type CacheStatus } from './audioCache'

import { fetchTtsHealth, syncTouchModeAfterSwitch, type TtsHealth } from './voiceForgeApi'



export type VoiceEngineLoadMode = 'curated' | 'engine' | 'prewarm' | 'realtime'



import type { TouchFeedbackMode } from './touchModeSettings'

export interface VoiceEngineLoadRequest {
  title: string
  message: string
  mode: VoiceEngineLoadMode
  sync?: boolean
  expectedTouchMode?: TouchFeedbackMode
  syncMessage?: string
}



const POLL_INTERVAL_MS = 800

const LOAD_TIMEOUT_MS = 600_000

const ENGINE_MOUNT_GRACE_MS = 20_000

const SYNC_STUCK_MS = 180_000

const TOUCH_MODE_MISMATCH_GRACE_MS = 3_000

const TOUCH_MODE_MISMATCH_ABORT_MS = 15_000

const RESYNC_INTERVAL_MS = 2_500



export function expectedTouchModeForLoad(mode: VoiceEngineLoadMode): TouchFeedbackMode {
  return mode === 'curated' ? 'curated' : 'custom_corpus'
}



function sleep(ms: number): Promise<void> {

  return new Promise((resolve) => window.setTimeout(resolve, ms))

}



function cacheLooksReadyOnDisk(cache: CacheStatus | null): boolean {

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



function isPrewarmStillRunning(health: TtsHealth | null, cache: CacheStatus | null): boolean {

  if (health?.sync_running || health?.prewarm_active) {

    return true

  }

  if (cache?.prewarm_active || cache?.building) {

    return true

  }

  return false

}



/** 仅「更新语料库 / 保存并预热」使用 determinate 进度；切换声线等用 indeterminate。 */

function resolveCorpusPrewarmProgress(

  mode: VoiceEngineLoadMode,

  health: TtsHealth | null,

  cache: CacheStatus | null

): { done: number; total: number } | null {

  if (mode !== 'prewarm' || !cache) {

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



function buildProgressMessage(

  mode: VoiceEngineLoadMode,

  health: TtsHealth | null,

  cache: CacheStatus | null,

  syncMessage?: string

): string {

  if (health?.sync_running) {

    if (mode === 'realtime') {

      return '正在切换实时推理喵~'

    }

    if (syncMessage) {

      return syncMessage

    }

    if (mode === 'engine') {

      return syncMessage ?? '正在切换音色喵~'

    }

    if (mode === 'prewarm') {

      return '正在预热语料库喵~'

    }

    return '正在切换声音喵~'

  }



  const corpusProgress = resolveCorpusPrewarmProgress(mode, health, cache)

  if (corpusProgress) {

    return `正在预热语料缓存 ${corpusProgress.done}/${corpusProgress.total}…`

  }



  if (mode === 'engine' && cache?.building) {

    return '克隆引擎已就绪，后台预热语料中…'

  }

  if (mode === 'realtime' && cache?.building) {

    return '实时推理已就绪，后台预热语料中…'

  }

  if (health?.engine && health.engine_matches_active) {

    return mode === 'realtime' ? '实时推理已就绪' : '克隆引擎已就绪'

  }

  if (mode === 'curated') {

    return '正在切换为精选触摸音频…'

  }

  return '正在连接语音服务…'

}



function isVoiceEngineLoadComplete(

  mode: VoiceEngineLoadMode,

  health: TtsHealth | null,

  cache: CacheStatus | null,

  expectedTouchMode: TouchFeedbackMode
): boolean {
  if (!health) {
    return false
  }

  if (health.sync_running) {
    return false
  }

  if (expectedTouchMode === 'curated') {
    if (mode === 'prewarm') {
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
    }
    return health.touch_mode === 'curated'
  }

  if (health.touch_mode !== expectedTouchMode) {
    return false
  }



  if (!health.engine || !health.engine_matches_active) {

    return false

  }



  if (mode === 'engine' || mode === 'realtime') {
    // 仅等待克隆引擎挂载；语料缓存可在后台继续预热（关闭实时推理 / 切换声线场景）
    return true
  }



  if (mode === 'prewarm') {

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

    return Boolean(cache?.ready)

  }



  return false

}



function shouldAbortWrongTouchMode(

  expectedTouchMode: TouchFeedbackMode,

  health: TtsHealth | null,

  syncFinishedAt: number | null,

  loadStartedAt: number,

  sawSyncRunning: boolean

): boolean {

  if (!health || health.sync_running || health.touch_mode === expectedTouchMode) {

    return false

  }

  if (syncFinishedAt !== null) {

    if (Date.now() - syncFinishedAt < TOUCH_MODE_MISMATCH_GRACE_MS) {

      return false

    }

    return true

  }

  if (sawSyncRunning) {

    return false

  }

  return Date.now() - loadStartedAt > TOUCH_MODE_MISMATCH_ABORT_MS

}



function shouldAbortSyncStuck(syncRunningSince: number | null): boolean {

  if (syncRunningSince === null) {

    return false

  }

  return Date.now() - syncRunningSince > SYNC_STUCK_MS

}



function shouldAbortEngineMountWait(

  mode: VoiceEngineLoadMode,

  health: TtsHealth | null,

  cache: CacheStatus | null,

  syncFinishedAt: number | null,

  loadStartedAt: number,

  sawSyncRunning: boolean

): boolean {

  if (mode === 'curated' || health?.sync_running) {

    return false

  }

  if (health?.engine && health.engine_matches_active) {

    return false

  }

  const finishedAt = syncFinishedAt ?? (sawSyncRunning ? null : loadStartedAt)

  if (finishedAt === null) {

    return false

  }

  if (Date.now() - finishedAt < ENGINE_MOUNT_GRACE_MS) {

    return false

  }

  return cacheLooksReadyOnDisk(cache)

}



export async function waitForVoiceEngineLoad(

  mode: VoiceEngineLoadMode,

  onUpdate: (state: { message: string; progress: { done: number; total: number } | null }) => void,

  expectedTouchMode: TouchFeedbackMode = expectedTouchModeForLoad(mode),

  syncMessage?: string

): Promise<boolean> {

  const deadline = Date.now() + LOAD_TIMEOUT_MS

  const loadStartedAt = Date.now()

  let sawSyncRunning = false

  let syncFinishedAt: number | null = null

  let syncRunningSince: number | null = null

  let lastResyncAt = 0



  while (Date.now() < deadline) {

    const [health, cache] = await Promise.all([fetchTtsHealth(), fetchCacheStatus()])



    if (

      health &&

      !health.sync_running &&

      health.touch_mode !== expectedTouchMode &&

      Date.now() - lastResyncAt > RESYNC_INTERVAL_MS

    ) {

      lastResyncAt = Date.now()

      const resynced = await syncTouchModeAfterSwitch()

      if (resynced.ok && resynced.touch_mode === expectedTouchMode) {

        sawSyncRunning = false

        syncFinishedAt = null

        syncRunningSince = null

      }

    }



    if (health?.sync_running) {

      sawSyncRunning = true

      if (syncRunningSince === null) {

        syncRunningSince = Date.now()

      }

    } else {

      syncRunningSince = null

      if (sawSyncRunning && syncFinishedAt === null) {

        syncFinishedAt = Date.now()

      }

    }



    const message = buildProgressMessage(mode, health, cache, syncMessage)

    const progress = resolveCorpusPrewarmProgress(mode, health, cache)



    onUpdate({ message, progress })



    if (isVoiceEngineLoadComplete(mode, health, cache, expectedTouchMode)) {

      return true

    }



    if (shouldAbortWrongTouchMode(expectedTouchMode, health, syncFinishedAt, loadStartedAt, sawSyncRunning)) {

      console.error('[VoiceEngineLoad] TTS 触摸模式与预期不一致', {

        mode,

        expectedTouchMode,

        touch_mode: health?.touch_mode,

        engine: health?.engine,

        engine_matches_active: health?.engine_matches_active

      })

      return false

    }



    if (shouldAbortSyncStuck(syncRunningSince)) {

      console.error('[VoiceEngineLoad] sync_running 超时，克隆引擎可能卡住', {

        mode,

        expectedTouchMode,

        touch_mode: health?.touch_mode

      })

      return false

    }



    if (

      shouldAbortEngineMountWait(

        mode,

        health,

        cache,

        syncFinishedAt,

        loadStartedAt,

        sawSyncRunning

      )

    ) {

      console.error('[VoiceEngineLoad] 同步已结束但克隆引擎未挂载', {

        mode,

        expectedTouchMode,

        touch_mode: health?.touch_mode,

        engine: health?.engine,

        engine_matches_active: health?.engine_matches_active,

        cache_ready: cache?.ready,

        cache_building: cache?.building,

        cache_message: cache?.message

      })

      return false

    }



    await sleep(POLL_INTERVAL_MS)

  }



  return false

}


