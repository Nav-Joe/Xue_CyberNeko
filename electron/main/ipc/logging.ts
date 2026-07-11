import { ipcMain } from 'electron'

import { logClientError, logInfo, type ClientErrorPayload } from '../logging/logger'

export function registerLoggingIpc(): void {
  ipcMain.handle('report-client-error', (_event, payload: ClientErrorPayload) => {
    if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
      return { ok: false as const }
    }
    logClientError(payload)
    return { ok: true as const }
  })

  ipcMain.handle(
    'log-renderer-info',
    (_event, payload: { scope?: string; message?: string; detail?: string }) => {
      if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
        return { ok: false as const }
      }
      logInfo(payload.scope?.trim() || 'renderer', payload.message, payload.detail)
      return { ok: true as const }
    }
  )
}
