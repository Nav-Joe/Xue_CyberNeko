import type { ScreenCompanionSessionEvent } from './sessionEvents'
import type { probeSteamPlaying } from './steamGate'
import type { listProcessExecutablePaths } from './processExecutables'
import type { findSteamRoot } from './steamPaths'
import type { listGameRoots } from './steamLibrary'
import type { startProcessWatch } from './processWatch'
import type { observePrimaryScreen } from './observe'
import type { generateCompanionNarrate } from './narrate'
import type { CompanionNarrateDeliverResult } from './narrateDelivery'

export type SchedulerDeps = {
  probeSteamPlaying: typeof probeSteamPlaying
  listProcessExecutablePaths: typeof listProcessExecutablePaths
  findSteamRoot: typeof findSteamRoot
  listGameRoots: typeof listGameRoots
  startProcessWatch: typeof startProcessWatch
  observePrimaryScreen: typeof observePrimaryScreen
  nowMs: () => number
  emitSession: (event: ScreenCompanionSessionEvent) => void
  generateNarrate?: (input: {
    gameName: string
    observation: import('./types').ScreenObservation
  }) => Promise<string | null>
  deliverNarrateTts?: (input: {
    text: string
    gameName: string
    ts: number
  }) => Promise<CompanionNarrateDeliverResult>
}
