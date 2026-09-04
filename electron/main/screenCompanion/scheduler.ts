/**
 * 屏幕偷窥调度：检测到 Steam 游戏进程后进会话；旁白 TTS 播完后再计间隔，循环观察与旁白。
 */
import { logInfo, logWarn } from '../logging/logger'
import { isChatTtsEnabledForCompanion } from './chatTtsGate'
import { readScreenCompanionConfig } from './configStore'
import { listGameRoots } from './steamLibrary'
import { findSteamRoot } from './steamPaths'
import { listProcessExecutablePaths } from './processExecutables'
import { pathUnderGameRoot, pickBestGameMatch, probeSteamPlaying } from './steamGate'
import { startProcessWatch, type ProcessWatchHandle } from './processWatch'
import { observePrimaryScreen } from './observe'
import { onSchedulerStopCycle, runSessionCycleTick, type CycleContext } from './schedulerCycle'
import { deliverCompanionNarrateTts } from './narrateDelivery'
import {
  emitScreenCompanionSession,
  type ScreenCompanionSessionEvent
} from './sessionEvents'
import type { SessionState } from './schedulerState'
import { newMemoryId } from '../memory/ids'
import { scheduleCompanionMemoryConsolidate } from './companionMemoryConsolidate'
import { clampIntervalSec } from './intervalSec'
export { clampIntervalSec } from './intervalSec'
import type { SchedulerDeps } from './schedulerDeps'
import type { SteamGameRoot } from './types'

const defaultDeps: SchedulerDeps = {
  probeSteamPlaying,
  listProcessExecutablePaths,
  findSteamRoot,
  listGameRoots,
  startProcessWatch,
  observePrimaryScreen,
  nowMs: () => Date.now(),
  emitSession: emitScreenCompanionSession,
  deliverNarrateTts: deliverCompanionNarrateTts
}

type SchedulerState = {
  running: boolean
  session: SessionState | null
  gamesCache: SteamGameRoot[]
  watch: ProcessWatchHandle | null
  checkTimer: ReturnType<typeof setInterval> | null
  huntTimer: ReturnType<typeof setInterval> | null
  huntDeadlineMs: number | null
  huntClosed: boolean
  nextCycleAtMs: number | null
  lastObservedAtMs: number | null
  lastNarratedAtMs: number | null
  cycleBusy: boolean
  hunting: boolean
  deps: SchedulerDeps
}

const state: SchedulerState = {
  running: false,
  session: null,
  gamesCache: [],
  watch: null,
  checkTimer: null,
  huntTimer: null,
  huntDeadlineMs: null,
  huntClosed: false,
  nextCycleAtMs: null,
  lastObservedAtMs: null,
  lastNarratedAtMs: null,
  cycleBusy: false,
  hunting: false,
  deps: defaultDeps
}

const HUNT_WINDOW_MS = 15_000
const HUNT_TICK_MS = 3_000

function normalizePathKey(p: string): string {
  return p.replace(/\//g, '\\').trim().toLowerCase()
}

function refreshGamesCache(deps: SchedulerDeps): SteamGameRoot[] {
  const root = deps.findSteamRoot()
  state.gamesCache = root ? deps.listGameRoots(root) : []
  return state.gamesCache
}

function clearCheckTimer(): void {
  if (state.checkTimer) {
    clearInterval(state.checkTimer)
    state.checkTimer = null
  }
}

function clearHuntTimer(): void {
  if (state.huntTimer) {
    clearInterval(state.huntTimer)
    state.huntTimer = null
  }
}

function closeHuntWindow(reason: string): void {
  if (state.huntClosed) {
    clearHuntTimer()
    return
  }
  state.huntClosed = true
  state.huntDeadlineMs = null
  clearHuntTimer()
  logInfo('screenCompanion', `hunt window closed (${reason}); trigger-only thereafter`)
}

function sessionHasTrackedWork(session: SessionState): boolean {
  return session.sticky || session.trackedPids.size > 0 || session.pathHints.size > 0
}

function leaveSession(reason: string): void {
  const prev = state.session
  if (prev) {
    logInfo('screenCompanion', `session leave (${reason}) game=${prev.gameName}`)
    // 陪玩总结仅 enqueue；此处禁止 await，以免拖住清会话 / 解聊天锁
    scheduleCompanionMemoryConsolidate({
      companionSessionId: prev.companionSessionId,
      gameName: prev.gameName,
      startedAtMs: prev.startedAtMs,
      endedAtMs: state.deps.nowMs()
    })
  }
  state.session = null
  state.nextCycleAtMs = null
  state.lastObservedAtMs = null
  state.lastNarratedAtMs = null
  state.cycleBusy = false
  clearCheckTimer()
  onSchedulerStopCycle()
  if (!prev) return
  state.deps.emitSession({
    sessionActive: false,
    playingGameName: null,
    reason,
    ts: state.deps.nowMs()
  })
}

function buildCycleContext(): CycleContext | null {
  if (!state.session) return null
  return {
    deps: state.deps,
    session: state.session,
    pathUnderGameRoot,
    leaveSession,
    getNextCycleAtMs: () => state.nextCycleAtMs,
    setNextCycleAtMs: (ms) => {
      state.nextCycleAtMs = ms
    },
    getCycleBusy: () => state.cycleBusy,
    setCycleBusy: (v) => {
      state.cycleBusy = v
    },
    setLastNarratedAtMs: (ms) => {
      state.lastNarratedAtMs = ms
    },
    setLastObservedAtMs: (ms) => {
      state.lastObservedAtMs = ms
    }
  }
}

async function runCycleTick(): Promise<void> {
  if (!state.running || !state.session || state.cycleBusy) return
  const config = readScreenCompanionConfig()
  // 总闸/TTS 关 → stop（清会话、解聊天锁）；禁止继续 observe
  if (!config.enabled || !isChatTtsEnabledForCompanion()) {
    stopScreenCompanionScheduler()
    return
  }
  const ctx = buildCycleContext()
  if (!ctx) return
  await runSessionCycleTick(ctx)
}

function ensureCheckTimer(): void {
  if (state.checkTimer) return
  state.checkTimer = setInterval(() => {
    void runCycleTick()
  }, 5_000)
}

function armFirstCycleDelay(): void {
  const intervalMs = clampIntervalSec(readScreenCompanionConfig().intervalSec) * 1000
  state.nextCycleAtMs = state.deps.nowMs() + intervalMs
}

function enterSession(
  game: SteamGameRoot,
  seed?: { pids?: number[]; paths?: string[]; sticky?: boolean }
): void {
  state.session = {
    companionSessionId: `companion-${newMemoryId()}`,
    startedAtMs: state.deps.nowMs(),
    gameName: game.gameName,
    gameRoot: game.gameRoot,
    trackedPids: new Set(seed?.pids ?? []),
    pathHints: new Set((seed?.paths ?? []).map(normalizePathKey).filter(Boolean)),
    sticky: seed?.sticky === true
  }
  armFirstCycleDelay()
  logInfo('screenCompanion', `session enter game=${game.gameName}`)
  clearHuntTimer()
  ensureCheckTimer()
  state.deps.emitSession({
    sessionActive: true,
    playingGameName: game.gameName,
    reason: 'enter',
    ts: state.deps.nowMs()
  })
}

async function huntPlayingIfNeeded(): Promise<void> {
  if (!state.running || state.session || state.hunting || state.huntClosed) return
  const now = state.deps.nowMs()
  if (state.huntDeadlineMs != null && now >= state.huntDeadlineMs) {
    closeHuntWindow('timeout-no-steam-game')
    return
  }
  state.hunting = true
  try {
    await bootstrapAlreadyPlaying(state.deps)
    if (state.session) closeHuntWindow('session-found')
  } catch (error) {
    logWarn('screenCompanion', 'hunt probe failed', error)
  } finally {
    state.hunting = false
  }
  if (
    state.running &&
    !state.session &&
    !state.huntClosed &&
    state.huntDeadlineMs != null &&
    state.deps.nowMs() >= state.huntDeadlineMs
  ) {
    closeHuntWindow('timeout-no-steam-game')
  }
}

function startHuntWindow(): void {
  if (state.huntClosed || state.session) return
  state.huntDeadlineMs = state.deps.nowMs() + HUNT_WINDOW_MS
  clearHuntTimer()
  state.huntTimer = setInterval(() => {
    void huntPlayingIfNeeded()
  }, HUNT_TICK_MS)
  logInfo('screenCompanion', `hunt window open for ${HUNT_WINDOW_MS}ms`)
}

function handleProcessEvent(event: { type: 'create' | 'delete'; pid: number; path: string }): void {
  if (!state.running) return
  const pathKey = event.path ? normalizePathKey(event.path) : ''

  if (event.type === 'create') {
    if (!pathKey) return
    const games = state.gamesCache.length > 0 ? state.gamesCache : refreshGamesCache(state.deps)
    const hit = pickBestGameMatch([event.path], games)
    if (!hit) return
    if (!state.session) {
      enterSession(hit, { pids: [event.pid], paths: [event.path] })
      return
    }
    if (pathUnderGameRoot(event.path, state.session.gameRoot)) {
      state.session.trackedPids.add(event.pid)
      state.session.pathHints.add(pathKey)
      state.session.sticky = false
      return
    }
    if (normalizePathKey(hit.gameRoot) !== normalizePathKey(state.session.gameRoot)) {
      leaveSession('switch-game')
      enterSession(hit, { pids: [event.pid], paths: [event.path] })
    }
    return
  }

  if (!state.session) return
  state.session.trackedPids.delete(event.pid)
  if (pathKey) {
    state.session.pathHints.delete(pathKey)
    if (pathUnderGameRoot(event.path, state.session.gameRoot)) {
      state.session.sticky = false
    }
  }
  if (!sessionHasTrackedWork(state.session)) {
    leaveSession('no-tracked-process')
  }
}

async function bootstrapAlreadyPlaying(deps: SchedulerDeps): Promise<void> {
  refreshGamesCache(deps)
  const status = await deps.probeSteamPlaying({ enabled: true })
  if (!status.playing) return
  const paths = await deps.listProcessExecutablePaths()
  const under = paths.filter((p) => pathUnderGameRoot(p, status.gameRoot))
  enterSession(
    { gameName: status.gameName, gameRoot: status.gameRoot },
    under.length > 0 ? { paths: under } : { sticky: true }
  )
}

export function setSchedulerTestDeps(partial: Partial<SchedulerDeps> | null): void {
  state.deps = partial ? { ...defaultDeps, ...partial } : defaultDeps
}

export function isScreenCompanionSchedulerRunning(): boolean {
  return state.running
}

export function getSchedulerSnapshot(nowMs = state.deps.nowMs()): {
  schedulerRunning: boolean
  sessionActive: boolean
  playingGameName: string | null
  lastObservedAtMs: number | null
  lastNarratedAtMs: number | null
  nextObserveAtMs: number | null
} {
  const next = state.nextCycleAtMs
  return {
    schedulerRunning: state.running,
    sessionActive: Boolean(state.session),
    playingGameName: state.session?.gameName ?? null,
    lastObservedAtMs: state.lastObservedAtMs,
    lastNarratedAtMs: state.lastNarratedAtMs,
    nextObserveAtMs: state.session ? next : null
  }
}

export async function startScreenCompanionScheduler(): Promise<void> {
  if (state.running) return
  const config = readScreenCompanionConfig()
  if (!config.enabled || !isChatTtsEnabledForCompanion()) return

  state.running = true
  state.nextCycleAtMs = null
  state.lastObservedAtMs = null
  state.lastNarratedAtMs = null
  state.cycleBusy = false
  state.huntClosed = false
  state.huntDeadlineMs = null
  refreshGamesCache(state.deps)

  state.watch = state.deps.startProcessWatch({
    onEvent: (ev) => handleProcessEvent(ev),
    onError: (detail) => logWarn('screenCompanion', 'processWatch', detail),
    onReady: () => logInfo('screenCompanion', 'processWatch ready')
  })

  try {
    await bootstrapAlreadyPlaying(state.deps)
  } catch (error) {
    logWarn('screenCompanion', 'bootstrap probe failed', error)
  }

  if (state.session) {
    closeHuntWindow('session-found-at-start')
  } else {
    startHuntWindow()
  }
  ensureCheckTimer()
  logInfo('screenCompanion', 'scheduler started')
}

export function stopScreenCompanionScheduler(): void {
  if (!state.running && !state.watch && !state.checkTimer) {
    leaveSession('stop')
    return
  }
  state.running = false
  state.watch?.stop()
  state.watch = null
  clearCheckTimer()
  clearHuntTimer()
  state.huntClosed = false
  state.huntDeadlineMs = null
  leaveSession('stop')
  state.hunting = false
  logInfo('screenCompanion', 'scheduler stopped')
}

export async function reconcileScreenCompanionScheduler(): Promise<void> {
  const enabled = readScreenCompanionConfig().enabled === true && isChatTtsEnabledForCompanion()
  if (enabled) {
    if (!state.running) {
      await startScreenCompanionScheduler()
    } else {
      refreshGamesCache(state.deps)
    }
  } else {
    stopScreenCompanionScheduler()
  }
}

export async function tickSchedulerObserveForTests(): Promise<void> {
  await runCycleTick()
}
