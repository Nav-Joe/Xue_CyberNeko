import type { LoadEvaluationContext, LoadTickResult, VoiceEngineLoadStrategy } from '../types'

export const curatedStrategy: VoiceEngineLoadStrategy = {
  name: 'curated',

  validatePayload(): void {
    // curated 模式由调用方传入 expectedTouchMode，通常为 'curated'
  },

  execute(ctx: LoadEvaluationContext): LoadTickResult {
    const { health, syncMessage } = ctx
    const syncRunning = Boolean(health?.sync_running)

    let message: string
    if (syncRunning) {
      message = syncMessage ?? '正在切换声音喵~'
    } else {
      message = '正在切换为精选触摸音频…'
    }

    const complete = Boolean(health && !health.sync_running && health.touch_mode === 'curated')

    return {
      complete,
      message,
      progress: null,
      abort: null,
      requestResync: false
    }
  }
}
