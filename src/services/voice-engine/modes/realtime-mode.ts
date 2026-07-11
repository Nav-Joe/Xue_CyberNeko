import type { LoadEvaluationContext, LoadTickResult, VoiceEngineLoadStrategy } from '../types'

function isRealtimeLoadComplete(ctx: LoadEvaluationContext): boolean {
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
  return true
}

function buildRealtimeMessage(ctx: LoadEvaluationContext): string {
  const { health, cache } = ctx

  if (health?.sync_running) {
    return '正在切换实时推理喵~'
  }
  if (cache?.building) {
    return '实时推理已就绪，后台预热语料中…'
  }
  if (health?.engine && health.engine_matches_active) {
    return '实时推理已就绪'
  }
  return '正在连接语音服务…'
}

export const realtimeStrategy: VoiceEngineLoadStrategy = {
  name: 'realtime',

  validatePayload(): void {
    // 开启实时推理时 expectedTouchMode 通常为 custom_corpus
  },

  execute(ctx: LoadEvaluationContext): LoadTickResult {
    return {
      complete: isRealtimeLoadComplete(ctx),
      message: buildRealtimeMessage(ctx),
      progress: null,
      abort: null,
      requestResync: false
    }
  }
}
