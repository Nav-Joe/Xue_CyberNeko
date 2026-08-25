import { ipcMain } from 'electron'



import {

  applyScreenCompanionConfigWrite,

  readScreenCompanionConfig,

  toScreenCompanionConfigView,

  writeScreenCompanionConfig,

  type ScreenCompanionConfigWritePayload

} from '../screenCompanion/configStore'

import { notifyCompanionNarrateTtsDone } from '../screenCompanion/narrateDelivery'

import { reconcileScreenCompanionScheduler } from '../screenCompanion/scheduler'

import { getScreenCompanionStatus, observeOnce } from '../screenCompanion/runtime'

import { logWarn } from '../logging/logger'



export function registerScreenCompanionIpc(): void {

  readScreenCompanionConfig()

  void reconcileScreenCompanionScheduler()



  ipcMain.handle('screen-companion-get-status', () => {

    try {

      return { ok: true as const, ...getScreenCompanionStatus() }

    } catch (error) {

      logWarn('screenCompanion', 'get-status failed', error)

      return { ok: false as const, detail: 'status_failed' }

    }

  })



  ipcMain.handle('screen-companion-read-config', () => {

    try {

      return { ok: true as const, config: toScreenCompanionConfigView(readScreenCompanionConfig()) }

    } catch (error) {

      logWarn('screenCompanion', 'read-config failed', error)

      return { ok: false as const, detail: 'read_failed' }

    }

  })



  ipcMain.handle(

    'screen-companion-write-config',

    async (_event, payload: ScreenCompanionConfigWritePayload) => {
      try {
        const current = readScreenCompanionConfig()
        const merged: ScreenCompanionConfigWritePayload = {
          ...toScreenCompanionConfigView(current),
          ...payload,
          intervalSec:
            payload.intervalSec !== undefined && payload.intervalSec !== null
              ? payload.intervalSec
              : current.intervalSec
        }
        const next = applyScreenCompanionConfigWrite(current, merged)

        const saved = writeScreenCompanionConfig(next)

        await reconcileScreenCompanionScheduler()

        return { ok: true as const, config: toScreenCompanionConfigView(saved) }

      } catch (error) {

        const message = error instanceof Error ? error.message : 'write_failed'

        if (message === 'tts_required') {

          return { ok: false as const, detail: 'tts_required' }

        }

        logWarn('screenCompanion', 'write-config failed', error)

        return { ok: false as const, detail: 'write_failed' }

      }

    }

  )



  ipcMain.handle('screen-companion-observe-once', async () => {

    try {

      const result = await observeOnce()

      return {

        ok: true as const,

        observation: result.observation,

        captureMs: result.captureMs,

        encodeMs: result.encodeMs,

        visionMs: result.visionMs,

        totalObserveMs: result.totalObserveMs

      }

    } catch (error) {

      logWarn('screenCompanion', 'observe-once failed', error)

      return {

        ok: false as const,

        detail: error instanceof Error ? error.message : 'observe_failed'

      }

    }

  })



  ipcMain.handle(

    'screen-companion-narrate-done',

    (_event, payload: { ts: number; ok?: boolean }) => {

      if (typeof payload?.ts !== 'number' || !Number.isFinite(payload.ts)) {

        return { ok: false as const }

      }

      notifyCompanionNarrateTtsDone({ ts: payload.ts, ok: payload.ok !== false })

      return { ok: true as const }

    }

  )

}

