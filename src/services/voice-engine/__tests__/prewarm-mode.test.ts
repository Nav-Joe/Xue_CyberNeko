import { describe, expect, it } from 'vitest'
import { prewarmStrategy } from '../modes/prewarm-mode'
import type { LoadEvaluationContext } from '../types'

const timing = {
  loadStartedAt: 0, sawSyncRunning: false, syncFinishedAt: null, syncRunningSince: null,
  lastResyncAt: 0, resyncCount: 0, syncJustFinished: false
}

const base = (health: LoadEvaluationContext['health'], cache: LoadEvaluationContext['cache']): LoadEvaluationContext => ({
  mode: 'prewarm', expectedTouchMode: 'custom_corpus', health, cache, timing
})

describe('prewarmStrategy', () => {
  it('sync_running health yields incomplete prewarm message', () => {
    const r = prewarmStrategy.execute(base(
      { status: 'ok', touch_mode: 'custom_corpus', engine: false, ready: false, sync_running: true, engine_matches_active: false },
      null
    ))
    expect(r.complete).toBe(false)
    expect(r.message).toBe('正在预热语料库喵~')
  })

  it('cache ready yields complete', () => {
    const r = prewarmStrategy.execute(base(
      { status: 'ok', touch_mode: 'custom_corpus', engine: true, ready: true, sync_running: false, engine_matches_active: true },
      { ready: true, building: false, stale: false, progress: { done: 1, total: 1 }, error: null }
    ))
    expect(r.complete).toBe(true)
  })
})
