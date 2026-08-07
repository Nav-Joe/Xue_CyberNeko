import { ipcMain } from 'electron'

import { logWarn } from '../logging/logger'
import { ensureSttService, stopManagedSttService } from '../stt/session'

export function registerSttIpc(): void {
  ipcMain.handle('stt-ensure-service', async () => {
    try {
      return await ensureSttService()
    } catch (error) {
      logWarn('stt', 'stt-ensure-service failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'ensure_failed'
      }
    }
  })

  ipcMain.handle('stt-stop-managed', () => {
    try {
      return stopManagedSttService()
    } catch (error) {
      logWarn('stt', 'stt-stop-managed failed', error)
      return { ok: true as const, stopped: false }
    }
  })
}
