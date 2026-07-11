import type { TouchFeedbackMode } from '../touchModeSettings'
import { LOAD_TIMEOUT_MS, POLL_INTERVAL_MS } from './constants'
import { LoadTimingTracker, maybeResync, pollHealthAndCache } from './health-monitor'
import {
  logLoadAbort,
  resolveSharedAbort,
  shouldAbortPrewarmStuck
} from './load-abort'
import { curatedStrategy } from './modes/curated-mode'
import { engineStrategy } from './modes/engine-mode'
import { prewarmStrategy } from './modes/prewarm-mode'
import { realtimeStrategy } from './modes/realtime-mode'
import type {
  LoadAbortReason,
  LoadEvaluationContext,
  VoiceEngineLoadMode,
  VoiceEngineLoadRequest,
  VoiceEngineLoadStrategy
} from './types'

export type { VoiceEngineLoadMode, VoiceEngineLoadRequest } from './types'

const STRATEGIES: Record<VoiceEngineLoadMode, VoiceEngineLoadStrategy> = {
  curated: curatedStrategy,
  engine: engineStrategy,
  prewarm: prewarmStrategy,
  realtime: realtimeStrategy
}

export function expectedTouchModeForLoad(mode: VoiceEngineLoadMode): TouchFeedbackMode {
  return mode === 'curated' ? 'curated' : 'custom_corpus'
}

function resolveStrategy(mode: VoiceEngineLoadMode): VoiceEngineLoadStrategy {
  const strategy = STRATEGIES[mode]
  if (!strategy) {
    throw new Error(`Unknown voice engine load mode: ${mode}`)
  }
  return strategy
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function resolveAbortReason(
  ctx: LoadEvaluationContext,
  strategyAbort: LoadAbortReason | null
): LoadAbortReason | null {
  if (strategyAbort) {
    return strategyAbort
  }
  const shared = resolveSharedAbort(ctx)
  if (shared) {
    return shared
  }
  if (ctx.mode === 'prewarm' && shouldAbortPrewarmStuck(ctx)) {
    return 'prewarm_stuck'
  }
  return null
}

export async function waitForVoiceEngineLoad(
  mode: VoiceEngineLoadMode,
  onUpdate: (state: { message: string; progress: { done: number; total: number } | null }) => void,
  expectedTouchMode: TouchFeedbackMode = expectedTouchModeForLoad(mode),
  syncMessage?: string
): Promise<boolean> {
  const strategy = resolveStrategy(mode)
  strategy.validatePayload(expectedTouchMode)

  const deadline = Date.now() + LOAD_TIMEOUT_MS
  const timing = new LoadTimingTracker()

  while (Date.now() < deadline) {
    const { health, cache } = await pollHealthAndCache()

    timing.observeHealth(health)

    const ctx: LoadEvaluationContext = {
      mode,
      expectedTouchMode,
      health,
      cache,
      syncMessage,
      timing: timing.snapshot()
    }

    const didResync = await maybeResync(ctx, timing)
    if (didResync) {
      continue
    }

    const tick = strategy.execute(ctx)

    onUpdate({ message: tick.message, progress: tick.progress })

    if (tick.complete) {
      return true
    }

    const abortReason = resolveAbortReason(ctx, tick.abort)
    if (abortReason) {
      logLoadAbort(ctx, abortReason)
      return false
    }

    await sleep(POLL_INTERVAL_MS)
  }

  return false
}
