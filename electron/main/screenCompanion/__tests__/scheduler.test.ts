import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { mkdtempSync, rmSync } from 'fs'

import { tmpdir } from 'os'

import { join } from 'path'



vi.mock('../chatTtsGate', () => ({

  isChatTtsEnabledForCompanion: () => true

}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp\\xue-scheduler-test', isQuitting: () => false },
  BrowserWindow: { getAllWindows: () => [] },
  webContents: { fromId: () => null }
}))



import {

  reconcileScreenCompanionScheduler,

  setSchedulerTestDeps,

  stopScreenCompanionScheduler,

  getSchedulerSnapshot,

  startScreenCompanionScheduler,

  tickSchedulerObserveForTests

} from '../scheduler'

import { clampIntervalSec } from '../intervalSec'

import {

  DEFAULT_SCREEN_COMPANION_CONFIG,

  setScreenCompanionConfigTestHooks,

  writeScreenCompanionConfig

} from '../configStore'

import { clearLatestObservation } from '../snapshot'



describe('clampIntervalSec', () => {

  it('defaults and clamps', () => {

    expect(clampIntervalSec(undefined)).toBe(90)

    expect(clampIntervalSec(10)).toBe(30)

    expect(clampIntervalSec(9999)).toBe(600)

    expect(clampIntervalSec(120)).toBe(120)

  })

})



function defaultTestSchedulerDeps(overrides: Record<string, unknown> = {}) {

  return {

    nowMs: () => 1_000_000,

    findSteamRoot: () => 'C:\\Steam',

    listGameRoots: () => [

      { gameName: 'DemoGame', gameRoot: 'C:\\Steam\\steamapps\\common\\DemoGame' }

    ],

    listProcessExecutablePaths: async () => [],

    probeSteamPlaying: async () => ({ playing: false }),

    startProcessWatch: (handlers: { onEvent: (e: unknown) => void }) => {

      return { stop: () => undefined, _handlers: handlers }

    },

    observePrimaryScreen: async () => ({

      observation: {

        ts: new Date().toISOString(),

        summary: 'ok',

        usableForPrompt: true

      },

      totalObserveMs: 1

    }),

    deliverNarrateTts: async () => 'playback_done' as const,

    generateNarrate: async () => 'test narrate line',

    ...overrides

  }

}



describe('scheduler session', () => {

  let dir: string

  let observeCalls: number

  let narrateCalls: number

  let processHandler: ((e: { type: 'create' | 'delete'; pid: number; path: string }) => void) | null



  beforeEach(() => {

    dir = mkdtempSync(join(tmpdir(), 'xue-sc-sched-'))

    observeCalls = 0

    narrateCalls = 0

    processHandler = null

    setScreenCompanionConfigTestHooks({

      configPath: join(dir, 'screen-companion-config.json'),

      crypto: {

        isAvailable: () => false,

        encrypt: () => null,

        decrypt: () => null

      }

    })

    writeScreenCompanionConfig({

      ...DEFAULT_SCREEN_COMPANION_CONFIG,

      enabled: true,

      intervalSec: 90,

      vision: { baseUrl: 'https://x', model: 'm', apiKey: 'k' }

    })

    clearLatestObservation()

    setSchedulerTestDeps(

      defaultTestSchedulerDeps({

        startProcessWatch: (handlers) => {

          processHandler = handlers.onEvent

          return { stop: () => undefined }

        },

        observePrimaryScreen: async () => {

          observeCalls += 1

          return {

            observation: {

              ts: new Date().toISOString(),

              summary: 'ok',

              usableForPrompt: true

            },

            totalObserveMs: 1

          }

        },

        deliverNarrateTts: async () => {

          narrateCalls += 1

          return 'playback_done' as const

        }

      })

    )

  })



  afterEach(() => {

    stopScreenCompanionScheduler()

    setSchedulerTestDeps(null)

    setScreenCompanionConfigTestHooks({ configPath: null, crypto: null })

    rmSync(dir, { recursive: true, force: true })

  })



  it('does not start when disabled', async () => {

    writeScreenCompanionConfig({ ...DEFAULT_SCREEN_COMPANION_CONFIG, enabled: false })

    await reconcileScreenCompanionScheduler()

    expect(getSchedulerSnapshot().schedulerRunning).toBe(false)

    expect(observeCalls).toBe(0)

  })



  it('process create enters session but does not observe immediately', async () => {

    let now = 1_000_000

    setSchedulerTestDeps(

      defaultTestSchedulerDeps({

        nowMs: () => now,

        startProcessWatch: (handlers) => {

          processHandler = handlers.onEvent

          return { stop: () => undefined }

        },

        listProcessExecutablePaths: async () => [

          'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

        ],

        observePrimaryScreen: async () => {

          observeCalls += 1

          return {

            observation: {

              ts: new Date().toISOString(),

              summary: 'ok',

              usableForPrompt: true

            },

            totalObserveMs: 1

          }

        },

        deliverNarrateTts: async () => {

          narrateCalls += 1

          return 'playback_done' as const

        }

      })

    )

    await startScreenCompanionScheduler()

    processHandler?.({

      type: 'create',

      pid: 4242,

      path: 'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

    })

    expect(getSchedulerSnapshot().sessionActive).toBe(true)

    expect(observeCalls).toBe(0)

    await tickSchedulerObserveForTests()

    expect(observeCalls).toBe(0)

    now += 90_000

    await tickSchedulerObserveForTests()

    expect(observeCalls).toBe(1)

    expect(narrateCalls).toBe(1)

  })



  it('process delete leaves session', async () => {

    const events: { sessionActive: boolean; reason: string }[] = []

    setSchedulerTestDeps(

      defaultTestSchedulerDeps({

        emitSession: (e) => events.push({ sessionActive: e.sessionActive, reason: e.reason }),

        startProcessWatch: (handlers) => {

          processHandler = handlers.onEvent

          return { stop: () => undefined }

        }

      })

    )

    await startScreenCompanionScheduler()

    processHandler?.({

      type: 'create',

      pid: 4242,

      path: 'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

    })

    expect(getSchedulerSnapshot().sessionActive).toBe(true)

    processHandler?.({

      type: 'delete',

      pid: 4242,

      path: 'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

    })

    expect(getSchedulerSnapshot().sessionActive).toBe(false)

    expect(events.some((e) => e.sessionActive === false && e.reason === 'no-tracked-process')).toBe(

      true

    )

  })



  it('interval tick leaves when game no longer running (sticky兜底)', async () => {

    let now = 1_000_000

    let paths: string[] = ['C:\\Steam\\steamapps\\common\\DemoGame\\game.exe']

    const events: { sessionActive: boolean; reason: string }[] = []

    setSchedulerTestDeps(

      defaultTestSchedulerDeps({

        nowMs: () => now,

        listProcessExecutablePaths: async () => paths,

        startProcessWatch: (handlers) => {

          processHandler = handlers.onEvent

          return { stop: () => undefined }

        },

        emitSession: (e) => events.push({ sessionActive: e.sessionActive, reason: e.reason })

      })

    )

    await startScreenCompanionScheduler()

    processHandler?.({

      type: 'create',

      pid: 7,

      path: 'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

    })

    paths = []

    now += 90_000

    await tickSchedulerObserveForTests()

    expect(observeCalls).toBe(0)

    expect(getSchedulerSnapshot().sessionActive).toBe(false)

    expect(events.some((e) => e.reason === 'interval-not-playing')).toBe(true)

  })



  it('bootstrap probe enters session without immediate observe', async () => {

    setSchedulerTestDeps(

      defaultTestSchedulerDeps({

        listProcessExecutablePaths: async () => [

          'C:\\Steam\\steamapps\\common\\DemoGame\\game.exe'

        ],

        probeSteamPlaying: async () => ({

          playing: true,

          gameName: 'DemoGame',

          gameRoot: 'C:\\Steam\\steamapps\\common\\DemoGame'

        }),

        startProcessWatch: () => ({ stop: () => undefined })

      })

    )

    await startScreenCompanionScheduler()

    expect(getSchedulerSnapshot().sessionActive).toBe(true)

    expect(observeCalls).toBe(0)

  })



  it('disable stops scheduler', async () => {

    await startScreenCompanionScheduler()

    writeScreenCompanionConfig({ ...DEFAULT_SCREEN_COMPANION_CONFIG, enabled: false })

    await reconcileScreenCompanionScheduler()

    expect(getSchedulerSnapshot().schedulerRunning).toBe(false)

    expect(getSchedulerSnapshot().sessionActive).toBe(false)

  })

})

