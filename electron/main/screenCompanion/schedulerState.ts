import type { SteamGameRoot } from './types'

export type SessionState = {
  companionSessionId: string
  startedAtMs: number
  gameName: string
  gameRoot: string
  trackedPids: Set<number>
  pathHints: Set<string>
  sticky: boolean
}

export type { SteamGameRoot }
