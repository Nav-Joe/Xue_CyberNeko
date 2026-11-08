import { ipcMain, shell } from 'electron'

import { dataRoot } from '../config/paths'
import { openEnvWindow } from '../windows/envWindow'
import { LIVE2D_SAMPLE_LICENSE } from './live2dLicense'
import { installRuntimeComponent, uninstallRuntimeComponent } from './jobs'
import { readRuntimeEnvStatus } from './status'
import { isRuntimeComponentId } from './types'

export function registerRuntimeEnvIpc(): void {
  ipcMain.handle('runtime-env-open-window', () => {
    const { alreadyOpen } = openEnvWindow()
    return { ok: true as const, alreadyOpen }
  })

  ipcMain.handle('runtime-env-list', () => {
    return readRuntimeEnvStatus(dataRoot())
  })

  ipcMain.handle('runtime-env-open-license', async () => {
    await shell.openExternal(LIVE2D_SAMPLE_LICENSE.url)
    return { ok: true as const }
  })

  ipcMain.handle('runtime-env-install', async (event, id: unknown, acceptLicense?: boolean) => {
    if (!isRuntimeComponentId(id)) {
      return { ok: false, detail: '未知组件。' }
    }
    const send = (line: string): void => {
      event.sender.send('runtime-env-log', { id, line })
    }
    return installRuntimeComponent(id, acceptLicense === true, send)
  })

  ipcMain.handle('runtime-env-uninstall', async (event, id: unknown) => {
    if (!isRuntimeComponentId(id)) {
      return { ok: false, detail: '未知组件。' }
    }
    const send = (line: string): void => {
      event.sender.send('runtime-env-log', { id, line })
    }
    return uninstallRuntimeComponent(id, send)
  })
}
