import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'path'

import './logging/registerErrorHandlers'
import { logFatal, logInfo, logWarn } from './logging/logger'
import { registerLoggingIpc } from './ipc/logging'

import { registerAppDialogsIpc } from './ipc/appDialogs'
import { registerAppLifecycleIpc } from './ipc/appLifecycle'
import { registerCharacterCardsIpc } from './ipc/characterCards'
import { registerChatConfigIpc } from './ipc/chatConfig'
import { registerLlmOpenaiIpc } from './ipc/llmOpenai'
import { registerLlamaServerIpc } from './ipc/llamaServer'
import { registerPetWindowIpc } from './ipc/petWindow'
import { registerVoiceRuntimeIpc } from './ipc/voiceRuntime'
import { setChatWindowLifecycle } from './chat/window'
import { reconcileVoiceRuntimeConfig, resetExperimentalFeaturesOnStartup } from './runtimeConfig'
import {
  prepareWindowsForChat,
  registerChatWindowIpc,
  restoreWindowsAfterChat
} from './windows/chatCoordination'
import { registerMemoryIpc } from './ipc/memory'
import { registerDesireIpc } from './ipc/desire'
import { registerRelationshipIpc } from './ipc/relationship'
import { registerPetTouchIpc } from './ipc/petTouch'
import { registerSttIpc } from './ipc/stt'
import { initMemorySubsystem, finalizeForAppQuit } from './memory/runtime'
import { stopManagedLlamaServer } from './llama/session'
import { stopManagedSttService } from './stt/session'
import { createVoiceEngineLoadCoordinator } from './voice/engineLoadCoordinator'
import { createHomeWindow, getHomeWindow, setQuitting } from './windows/homeWindow'
import {
  createPetWindow,
  getPetWindow,
  getPetWindowSize,
  lockPetWindowSize,
  setPetWindowOverlay,
  showPetWindowIfNeeded
} from './windows/petWindow'

const require = createRequire(import.meta.url)
const appInstanceLock = require(join(__dirname, '../../scripts/app-instance-lock.js')) as {
  writeLock: (pid: number, role?: string) => void
  clearLock: (expectedPid?: number) => void
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const petWindow = getPetWindow()
    if (petWindow) {
      if (petWindow.isMinimized()) {
        petWindow.restore()
      }
      petWindow.show()
      petWindow.focus()
    }
  })
}

let pendingVoiceUploadPath: string | null = null

function broadcastVoiceSamplesChanged(): void {
  getHomeWindow()?.webContents.send('voice-samples-changed')
  getPetWindow()?.webContents.send('voice-samples-changed')
}

const voiceEngineLoad = createVoiceEngineLoadCoordinator()

function registerIpc(): void {
  registerLoggingIpc()
  registerCharacterCardsIpc()
  registerChatConfigIpc()
  registerLlmOpenaiIpc()
  registerLlamaServerIpc()

  registerPetWindowIpc({
    getPetWindow,
    getPetWindowSize,
    lockPetWindowSize,
    setPetWindowOverlay,
    showPetWindowIfNeeded
  })

  registerAppDialogsIpc({
    setPendingVoiceUploadPath: (filePath) => {
      pendingVoiceUploadPath = filePath
    }
  })

  registerAppLifecycleIpc({
    createHomeWindow,
    setQuitting
  })

  registerVoiceRuntimeIpc({
    broadcastVoiceSamplesChanged,
    getPendingVoiceUploadPath: () => pendingVoiceUploadPath,
    setPendingVoiceUploadPath: (filePath) => {
      pendingVoiceUploadPath = filePath
    },
    completeVoiceSwitchOnPet: voiceEngineLoad.completeVoiceSwitchOnPet,
    beginVoiceEngineLoadOnPet: voiceEngineLoad.beginVoiceEngineLoadOnPet,
    onVoiceEngineLoadFinished: voiceEngineLoad.onVoiceEngineLoadFinished
  })

  registerChatWindowIpc()
  registerMemoryIpc()
  registerDesireIpc()
  registerRelationshipIpc()
  registerPetTouchIpc()
  registerSttIpc()
}

let quittingFinalizeStarted = false

app.on('before-quit', (event) => {
  setQuitting(true)
  appInstanceLock.clearLock(process.pid)

  if (quittingFinalizeStarted) {
    return
  }
  // 关窗延迟整理：先藏窗体让用户感觉已退出，后台完成总结再 kill llama 并真正退出
  event.preventDefault()
  quittingFinalizeStarted = true

  const hideAll = (): void => {
    try {
      getHomeWindow()?.hide()
      getPetWindow()?.hide()
    } catch {
      /* ignore */
    }
  }
  hideAll()

  void (async () => {
    try {
      await finalizeForAppQuit(async () => {
        stopManagedSttService()
        return stopManagedLlamaServer()
      })
    } catch (error) {
      logWarn('main', 'before-quit finalize failed', error)
    } finally {
      app.exit(0)
    }
  })()
})

app.whenReady().then(() => {
  try {
    appInstanceLock.writeLock(process.pid, 'app')
    resetExperimentalFeaturesOnStartup()
    reconcileVoiceRuntimeConfig()
    initMemorySubsystem()
    setChatWindowLifecycle({
      onOpened: prepareWindowsForChat,
      onClosed: restoreWindowsAfterChat
    })
    registerIpc()
    createPetWindow()
    logInfo('main', 'Application ready')

    app.on('activate', () => {
      if (!getPetWindow()) {
        createPetWindow()
      }
    })
  } catch (error) {
    logFatal('main', 'Startup failed in app.whenReady', error)
    throw error
  }
}).catch((error) => {
  logFatal('main', 'app.whenReady rejected', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
