import { describe, expect, it, vi } from 'vitest'

import { extractLibraryPathsFromVdf, listGameRootsFromLibraries } from '../steamLibrary'
import { parseRegSzValue } from '../steamPaths'
import { parseProcessPathLines } from '../processExecutables'
import { pathUnderGameRoot, pickBestGameMatch, probeSteamPlaying } from '../steamGate'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('steamLibrary helpers', () => {
  it('extracts path entries from libraryfolders.vdf text', () => {
    const vdf = `
"libraryfolders"
{
  "0"
  {
    "path" "C:\\\\Program Files (x86)\\\\Steam"
  }
  "1"
  {
    "path" "D:\\\\SteamLibrary"
  }
}
`
    expect(extractLibraryPathsFromVdf(vdf)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary'
    ])
  })

  it('lists common game folders from fixture libs', () => {
    const root = mkdtempSync(join(tmpdir(), 'xue-steam-lib-'))
    const common = join(root, 'steamapps', 'common')
    mkdirSync(join(common, 'DemoGame'), { recursive: true })
    mkdirSync(join(common, 'OtherGame'), { recursive: true })
    writeFileSync(join(common, 'readme.txt'), 'x')

    const games = listGameRootsFromLibraries([root])
    expect(games.map((g) => g.gameName).sort()).toEqual(['DemoGame', 'OtherGame'])
  })
})

describe('steamPaths / process parse', () => {
  it('parses reg SZ line', () => {
    const out = `
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam
`
    expect(parseRegSzValue(out)).toBe('C:\\Program Files (x86)\\Steam')
  })

  it('parses process path lines', () => {
    expect(parseProcessPathLines('ExecutablePath\r\nC:\\a\\b.exe\r\n\r\nD:\\c.exe\n')).toEqual([
      'C:\\a\\b.exe',
      'D:\\c.exe'
    ])
  })

  it('WIN_PROCESS_PATH_PS avoids $_ placeholder', async () => {
    const { WIN_PROCESS_PATH_PS } = await import('../processExecutables')
    expect(WIN_PROCESS_PATH_PS.includes('$_')).toBe(false)
    expect(WIN_PROCESS_PATH_PS).toMatch(/ExpandProperty ExecutablePath/)
  })
})

describe('steamGate matching', () => {
  it('matches exe under game root case-insensitively', () => {
    expect(pathUnderGameRoot('C:\\Steam\\steamapps\\common\\Demo\\game.exe', 'c:\\steam\\steamapps\\common\\Demo')).toBe(
      true
    )
    expect(pathUnderGameRoot('C:\\Steam\\steam.exe', 'C:\\Steam\\steamapps\\common\\Demo')).toBe(false)
  })

  it('picks longest game root when multiple match', () => {
    const hit = pickBestGameMatch(
      ['C:\\Libs\\steamapps\\common\\Pack\\Sub\\bin\\game.exe'],
      [
        { gameName: 'Pack', gameRoot: 'C:\\Libs\\steamapps\\common\\Pack' },
        { gameName: 'Sub', gameRoot: 'C:\\Libs\\steamapps\\common\\Pack\\Sub' }
      ]
    )
    expect(hit?.gameName).toBe('Sub')
  })

  it('returns not playing when disabled without calling deps', async () => {
    const findSteamRoot = vi.fn()
    const listGameRoots = vi.fn()
    const listProcessExecutablePaths = vi.fn()
    const status = await probeSteamPlaying({
      enabled: false,
      deps: { findSteamRoot, listGameRoots, listProcessExecutablePaths }
    })
    expect(status).toEqual({ playing: false })
    expect(findSteamRoot).not.toHaveBeenCalled()
    expect(listGameRoots).not.toHaveBeenCalled()
    expect(listProcessExecutablePaths).not.toHaveBeenCalled()
  })

  it('returns playing when process path hits common game folder', async () => {
    const status = await probeSteamPlaying({
      enabled: true,
      deps: {
        findSteamRoot: () => 'C:\\FakeSteam',
        listGameRoots: () => [
          { gameName: 'DemoGame', gameRoot: 'C:\\FakeSteam\\steamapps\\common\\DemoGame' }
        ],
        listProcessExecutablePaths: async () => [
          'C:\\FakeSteam\\steam.exe',
          'C:\\FakeSteam\\steamapps\\common\\DemoGame\\DemoGame.exe'
        ]
      }
    })
    expect(status).toEqual({
      playing: true,
      gameName: 'DemoGame',
      gameRoot: 'C:\\FakeSteam\\steamapps\\common\\DemoGame'
    })
  })

  it('ignores steam client-only paths', async () => {
    const status = await probeSteamPlaying({
      enabled: true,
      deps: {
        findSteamRoot: () => 'C:\\FakeSteam',
        listGameRoots: () => [
          { gameName: 'DemoGame', gameRoot: 'C:\\FakeSteam\\steamapps\\common\\DemoGame' }
        ],
        listProcessExecutablePaths: async () => ['C:\\FakeSteam\\steam.exe', 'C:\\FakeSteam\\bin\\steamwebhelper.exe']
      }
    })
    expect(status).toEqual({ playing: false })
  })

  it('ignores wallpaper_engine as a false-positive game', async () => {
    const status = await probeSteamPlaying({
      enabled: true,
      deps: {
        findSteamRoot: () => 'C:\\FakeSteam',
        listGameRoots: () => [
          { gameName: 'wallpaper_engine', gameRoot: 'C:\\FakeSteam\\steamapps\\common\\wallpaper_engine' },
          { gameName: 'DemoGame', gameRoot: 'C:\\FakeSteam\\steamapps\\common\\DemoGame' }
        ],
        listProcessExecutablePaths: async () => [
          'C:\\FakeSteam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe'
        ]
      }
    })
    expect(status).toEqual({ playing: false })
  })
})
