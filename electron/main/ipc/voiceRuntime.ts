import { ipcMain } from 'electron'
import { readFileSync } from 'fs'

import { DEFAULT_LIVE2D_MODEL_WEB_PATH, resolveLive2DModelWebPath } from '../live2dModel'
import {
  applyAltEngineCorpus,
  applyCorpusPrewarm,
  cancelVoiceForgeReview,
  deleteVoiceSample,
  disableAltEngineCorpus,
  isOfficialTouchCacheReady,
  listVoiceSamples,
  prepareVoiceCreation,
  prepareVoiceUpload,
  readExperimentalVoiceUploadEnabled,
  readRealtimeInferenceFlag,
  readSampleCorpus,
  readTouchConfig,
  readVoiceForgeConfig,
  requestVoiceModelRegeneration,
  setOfficialTouchPlayback,
  setRealtimeTouchInference,
  switchVoiceSample,
  writeExperimentalVoiceUploadEnabled,
  writeTouchConfig,
  writeVoiceForgeConfig,
  type TouchFeedbackMode
} from '../runtimeConfig'
import { readTtsEngineCapabilities } from '../ttsEngineInfo'
import type { CorpusData } from '../../../src/types/corpus'

export type VoiceRuntimeIpcDeps = {
  broadcastVoiceSamplesChanged: () => void
  getPendingVoiceUploadPath: () => string | null
  setPendingVoiceUploadPath: (filePath: string | null) => void
  completeVoiceSwitchOnPet: (payload: {
    touchMode: 'curated' | 'custom_corpus'
    loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
    prewarm?: boolean
  }) => Promise<void>
  beginVoiceEngineLoadOnPet: (payload: {
    title: string
    message: string
    mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
    sync?: boolean
    expectedTouchMode?: 'curated' | 'custom_corpus'
    syncMessage?: string
  }) => Promise<{ ok: boolean }>
  onVoiceEngineLoadFinished: (result: { ok: boolean }) => void
}

export function registerVoiceRuntimeIpc(deps: VoiceRuntimeIpcDeps): void {
  ipcMain.handle('read-touch-config', () => {
    return readTouchConfig()
  })

  ipcMain.handle('read-tts-capabilities', () => {
    return readTtsEngineCapabilities()
  })

  ipcMain.handle('get-live2d-model-url', () => {
    return resolveLive2DModelWebPath() ?? DEFAULT_LIVE2D_MODEL_WEB_PATH
  })

  ipcMain.handle('read-voice-forge-config', () => {
    return readVoiceForgeConfig()
  })

  ipcMain.handle('read-sample-corpus', (_event, folderId: string) => {
    return readSampleCorpus(folderId)
  })

  ipcMain.handle('write-touch-config', (_event, mode: TouchFeedbackMode, corpus: CorpusData) => {
    writeTouchConfig(mode, corpus)
    return { ok: true }
  })

  ipcMain.handle(
    'write-voice-forge-config',
    (_event, mode: TouchFeedbackMode, corpus: CorpusData, instruct: string) => {
      writeVoiceForgeConfig(mode, corpus, instruct)
      return { ok: true }
    }
  )

  ipcMain.handle('request-voice-model-regeneration', () => {
    requestVoiceModelRegeneration()
    return { ok: true }
  })

  ipcMain.handle(
    'prepare-voice-creation',
    (
      _event,
      mode: TouchFeedbackMode,
      corpus: CorpusData,
      instruct: string,
      displayName: string
    ) => {
      const profile = prepareVoiceCreation(mode, corpus, instruct, displayName)
      deps.broadcastVoiceSamplesChanged()
      return profile
    }
  )

  ipcMain.handle('read-experimental-voice-upload', () => {
    return { enabled: readExperimentalVoiceUploadEnabled() }
  })

  ipcMain.handle('set-experimental-voice-upload', (_event, enabled: boolean) => {
    writeExperimentalVoiceUploadEnabled(Boolean(enabled))
    return { enabled: readExperimentalVoiceUploadEnabled() }
  })

  ipcMain.handle('cancel-voice-upload-staging', () => {
    deps.setPendingVoiceUploadPath(null)
    return { ok: true }
  })

  ipcMain.handle(
    'prepare-voice-upload',
    (
      _event,
      payload: {
        displayName: string
        corpus: CorpusData
        referenceText: string
      }
    ) => {
      if (!readExperimentalVoiceUploadEnabled()) {
        throw new Error('实验级上传功能未开启')
      }
      const pendingPath = deps.getPendingVoiceUploadPath()
      if (!pendingPath) {
        throw new Error('请先选择 WAV 文件')
      }
      const wavBuffer = readFileSync(pendingPath)
      deps.setPendingVoiceUploadPath(null)
      const profile = prepareVoiceUpload(
        payload.displayName,
        payload.corpus,
        payload.referenceText,
        wavBuffer
      )
      deps.broadcastVoiceSamplesChanged()
      return profile
    }
  )

  ipcMain.handle('list-voice-samples', () => {
    return listVoiceSamples()
  })

  ipcMain.handle('switch-voice-sample', (_event, folderId: string) => {
    const profile = switchVoiceSample(folderId)
    deps.broadcastVoiceSamplesChanged()
    return profile
  })

  ipcMain.handle('delete-voice-sample', (_event, folderId: string) => {
    const result = deleteVoiceSample(folderId)
    deps.broadcastVoiceSamplesChanged()
    return result
  })

  ipcMain.handle('cancel-voice-forge-review', () => {
    const result = cancelVoiceForgeReview()
    deps.broadcastVoiceSamplesChanged()
    return result
  })

  ipcMain.handle(
    'complete-voice-switch',
    async (
      _event,
      payload: {
        touchMode: 'curated' | 'custom_corpus'
        loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
        prewarm?: boolean
      }
    ) => {
      await deps.completeVoiceSwitchOnPet(payload)
      deps.broadcastVoiceSamplesChanged()
      return { ok: true }
    }
  )

  ipcMain.handle(
    'begin-voice-engine-load',
    async (
      _event,
      payload: {
        title: string
        message: string
        mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
        sync?: boolean
      }
    ) => {
      return deps.beginVoiceEngineLoadOnPet(payload)
    }
  )

  ipcMain.on('voice-engine-load-finished', (_event, result: { ok: boolean }) => {
    deps.onVoiceEngineLoadFinished(result)
  })

  ipcMain.handle('apply-corpus-prewarm', (_event, folderId: string, corpus: CorpusData) => {
    const profile = applyCorpusPrewarm(folderId, corpus)
    deps.broadcastVoiceSamplesChanged()
    return profile
  })

  ipcMain.handle('apply-alt-engine-corpus', (_event, corpus: CorpusData) => {
    return applyAltEngineCorpus(corpus)
  })

  ipcMain.handle('disable-alt-engine-corpus', () => {
    return disableAltEngineCorpus()
  })

  ipcMain.handle('notify-voice-samples-changed', () => {
    deps.broadcastVoiceSamplesChanged()
    return { ok: true }
  })

  ipcMain.handle('set-official-touch-playback', (_event, useCuratedClips: boolean) => {
    const result = setOfficialTouchPlayback(useCuratedClips)
    deps.broadcastVoiceSamplesChanged()
    return { ok: true, ...result }
  })

  ipcMain.handle('check-official-touch-cache-ready', () => {
    return { ready: isOfficialTouchCacheReady() }
  })

  ipcMain.handle('read-realtime-inference-flag', () => {
    return { enabled: readRealtimeInferenceFlag() }
  })

  ipcMain.handle('set-realtime-touch-inference', (_event, enabled: boolean) => {
    const result = setRealtimeTouchInference(enabled)
    deps.broadcastVoiceSamplesChanged()
    return result
  })
}
