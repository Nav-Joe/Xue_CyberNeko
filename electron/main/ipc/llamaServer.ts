import { ipcMain } from 'electron'

import {
  beginLlamaChatSession,
  downloadDefaultLocalModel,
  getLocalModelStatus,
  probeLocalLlamaServer,
  stopManagedLlamaServer,
  type BeginLlamaSessionOptions,
  type LlamaBootstrapProgress
} from '../llama/session'

function createProgressSender(event: Electron.IpcMainInvokeEvent) {
  const sender = event.sender
  return (payload: LlamaBootstrapProgress) => {
    if (!sender.isDestroyed()) {
      sender.send('chat-llama-bootstrap-progress', payload)
    }
  }
}

export function registerLlamaServerIpc(): void {
  ipcMain.handle('chat-get-local-model-status', async () => getLocalModelStatus())

  ipcMain.handle('chat-probe-local-llama-server', async () => probeLocalLlamaServer())

  ipcMain.handle(
    'chat-begin-llama-session',
    async (event, options?: BeginLlamaSessionOptions) => {
      return beginLlamaChatSession(createProgressSender(event), options)
    }
  )

  ipcMain.handle('chat-download-local-model', async (event) => {
    return downloadDefaultLocalModel(createProgressSender(event))
  })

  ipcMain.handle('chat-end-llama-session', async () => stopManagedLlamaServer())
}
