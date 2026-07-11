import type { LoadEvaluationContext, LoadTickResult, VoiceEngineLoadStrategy } from '../types'

function isEngineLoadComplete(ctx: LoadEvaluationContext): boolean {
  const { health, expectedTouchMode } = ctx
  if (!health || health.sync_running) {
    return false
  }
  if (expectedTouchMode === 'curated') {
    return health.touch_mode === 'curated'
  }
  if (health.touch_mode !== expectedTouchMode) {
    return false
  }
  if (!health.engine || !health.engine_matches_active) {
    return false
  }
  // 仅等待克隆引擎挂载；语料缓存可在后台继续预热
  return true
}

function buildEngineMessage(ctx: LoadEvaluationContext): string {
  const { health, cache, syncMessage } = ctx

  if (health?.sync_running) {
    return syncMessage ?? '正在切换音色喵~'
  }
  if (cache?.building) {
    return '克隆引擎已就绪，后台预热语料中…'
  }
  if (health?.engine && health.engine_matches_active) {
    return '克隆引擎已就绪'
  }
  return '正在连接语音服务…'
}

export const engineStrategy: VoiceEngineLoadStrategy = {
  name: 'engine',

  validatePayload(): void {
    // engine 通常配合 custom_corpus；alt_engine_corpus 由 prewarm 处理
  },

  execute(ctx: LoadEvaluationContext): LoadTickResult {
    return {
      complete: isEngineLoadComplete(ctx),
      message: buildEngineMessage(ctx),
      progress: null,
      abort: null,
      requestResync: false
    }
  }
}
