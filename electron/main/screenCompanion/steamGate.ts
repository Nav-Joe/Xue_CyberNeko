/**
 * 判断是否在玩 Steam 游戏：游戏库目录与当前运行进程路径取交集。
 */
import { findSteamRoot } from './steamPaths'
import { listGameRoots } from './steamLibrary'
import { listProcessExecutablePaths } from './processExecutables'
import type { SteamGateDeps, SteamGameRoot, SteamPlayingStatus } from './types'

/** 装在 common 下但不应算「在玩游戏」的目录名（小写比较） */
export const STEAM_COMMON_EXCLUDE_NAMES = new Set([
  'wallpaper_engine',
  'steamworks shared',
  'steamvr',
  'proton experimental',
  'steam linux runtime',
  'steam linux runtime - soldier',
  'steam linux runtime - sniper'
])

function normalizePath(p: string): string {
  return p.replace(/\//g, '\\').replace(/[\\/]+$/, '').toLowerCase()
}

export function isExcludedSteamCommonName(gameName: string): boolean {
  return STEAM_COMMON_EXCLUDE_NAMES.has(gameName.trim().toLowerCase())
}

/** 进程路径是否落在某游戏根目录下 */
export function pathUnderGameRoot(exePath: string, gameRoot: string): boolean {
  const exe = normalizePath(exePath)
  const root = normalizePath(gameRoot)
  if (!exe || !root) return false
  return exe === root || exe.startsWith(root + '\\')
}

/** 多个命中时取 gameRoot 路径最长者（更具体）；跳过排除目录 */
export function pickBestGameMatch(
  processPaths: string[],
  games: SteamGameRoot[]
): SteamGameRoot | null {
  let best: SteamGameRoot | null = null
  let bestLen = -1
  for (const exe of processPaths) {
    for (const game of games) {
      if (isExcludedSteamCommonName(game.gameName)) continue
      if (!pathUnderGameRoot(exe, game.gameRoot)) continue
      const len = normalizePath(game.gameRoot).length
      if (len > bestLen) {
        best = game
        bestLen = len
      }
    }
  }
  return best
}

const defaultDeps: SteamGateDeps = {
  findSteamRoot,
  listGameRoots,
  listProcessExecutablePaths
}

/**
 * @param enabled 总开关；为 false 时不读 Steam 目录、不扫进程
 */
export async function probeSteamPlaying(input: {
  enabled: boolean
  deps?: Partial<SteamGateDeps>
}): Promise<SteamPlayingStatus> {
  if (!input.enabled) return { playing: false }

  const deps: SteamGateDeps = { ...defaultDeps, ...input.deps }

  try {
    const steamRoot = deps.findSteamRoot()
    if (!steamRoot) return { playing: false }

    const games = deps.listGameRoots(steamRoot)
    if (games.length === 0) return { playing: false }

    const processPaths = await deps.listProcessExecutablePaths()
    const hit = pickBestGameMatch(processPaths, games)
    if (!hit) return { playing: false }

    return {
      playing: true,
      gameName: hit.gameName,
      gameRoot: hit.gameRoot
    }
  } catch {
    return { playing: false }
  }
}
