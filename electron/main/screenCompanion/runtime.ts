/**
 * 产品入口：单次观察与状态查询；调度启停见 scheduler。
 */
import { isVisionConfigured, readScreenCompanionConfig } from './configStore'
import { observePrimaryScreen, type ObserveResult, type ObserveScreenOptions } from './observe'
import { getSchedulerSnapshot } from './scheduler'
import { getLatestObservation, setLatestObservation } from './snapshot'
import type { ScreenCompanionStatus } from './types'

export async function observeOnce(
  overrides?: Partial<ObserveScreenOptions>
): Promise<ObserveResult> {
  const config = readScreenCompanionConfig()
  const result = await observePrimaryScreen({
    enabled: overrides?.enabled ?? config.enabled,
    pausedUntilMs: overrides?.pausedUntilMs ?? config.pausedUntilMs,
    processBlacklist: overrides?.processBlacklist ?? config.processBlacklist,
    nowMs: overrides?.nowMs,
    vision: overrides?.vision ?? config.vision,
    capture: overrides?.capture,
    visionDeps: overrides?.visionDeps,
    deps: overrides?.deps
  })
  setLatestObservation(result.observation)
  return result
}

export function getScreenCompanionStatus(nowMs = Date.now()): ScreenCompanionStatus {
  const config = readScreenCompanionConfig()
  const paused =
    typeof config.pausedUntilMs === 'number' &&
    Number.isFinite(config.pausedUntilMs) &&
    config.pausedUntilMs > nowMs
  const sched = getSchedulerSnapshot(nowMs)
  return {
    enabled: config.enabled === true,
    paused,
    pausedUntilMs: config.pausedUntilMs,
    hasVisionApiKey: Boolean(config.vision.apiKey.trim()),
    visionConfigured: isVisionConfigured(config.vision),
    latestObservation: getLatestObservation(),
    schedulerRunning: sched.schedulerRunning,
    sessionActive: sched.sessionActive,
    playingGameName: sched.playingGameName,
    lastObservedAtMs: sched.lastObservedAtMs,
    nextObserveAtMs: sched.nextObserveAtMs,
    lastNarratedAtMs: sched.lastNarratedAtMs
  }
}
