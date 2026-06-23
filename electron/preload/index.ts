import { contextBridge, ipcRenderer } from 'electron'

export type WindowType = 'pet' | 'home'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  getWindowType: (): WindowType => {
    const hash = window.location.hash.replace('#', '')
    return hash === 'home' ? 'home' : 'pet'
  },

  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send('set-ignore-mouse-events', ignore)
  },

  getPetWindowPosition: (): Promise<{ x: number; y: number }> => {
    return ipcRenderer.invoke('get-pet-window-position')
  },

  setPetWindowSize: (width: number, height: number): Promise<{ width: number; height: number }> => {
    return ipcRenderer.invoke('set-pet-window-size', width, height)
  },

  setPetWindowOverlay: (width: number, height: number, recenter?: boolean): Promise<{ width: number; height: number }> => {
    return ipcRenderer.invoke('set-pet-window-overlay', width, height, recenter)
  },

  setPetWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send('set-pet-window-position', x, y)
  },

  onHomeVisibilityChanged: (callback: (visible: boolean) => void): (() => void) => {
    const handler = (_event: unknown, visible: boolean): void => {
      callback(visible)
    }
    ipcRenderer.on('home-visibility-changed', handler)
    return () => {
      ipcRenderer.removeListener('home-visibility-changed', handler)
    }
  },

  onVoiceConfigChanged: (
    callback: (payload: {
      touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
      loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
      prewarm?: boolean
    }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      payload: {
        touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
        loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
        prewarm?: boolean
      }
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('voice-config-changed', handler)
    return () => {
      ipcRenderer.removeListener('voice-config-changed', handler)
    }
  },

  onVoiceEngineLoadBegin: (
    callback: (payload: {
      title: string
      message: string
      mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
      sync?: boolean
      expectedTouchMode?: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
      syncMessage?: string
    }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      payload: {
        title: string
        message: string
        mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
        sync?: boolean
        expectedTouchMode?: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
        syncMessage?: string
      }
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('voice-engine-load-begin', handler)
    return () => {
      ipcRenderer.removeListener('voice-engine-load-begin', handler)
    }
  },

  beginVoiceEngineLoad: (payload: {
    title: string
    message: string
    mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
    sync?: boolean
    expectedTouchMode?: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    syncMessage?: string
  }): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('begin-voice-engine-load', payload)
  },

  notifyVoiceEngineLoadFinished: (result: { ok: boolean }): void => {
    ipcRenderer.send('voice-engine-load-finished', result)
  },

  onVoiceSamplesChanged: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('voice-samples-changed', handler)
    return () => {
      ipcRenderer.removeListener('voice-samples-changed', handler)
    }
  },

  notifyVoiceSamplesChanged: (): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('notify-voice-samples-changed')
  },

  setOfficialTouchPlayback: (
    useCuratedClips: boolean
  ): Promise<{ ok: boolean; touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'; officialUseCuratedClips: boolean }> => {
    return ipcRenderer.invoke('set-official-touch-playback', useCuratedClips)
  },

  checkOfficialTouchCacheReady: (): Promise<{ ready: boolean }> => {
    return ipcRenderer.invoke('check-official-touch-cache-ready')
  },

  readRealtimeInferenceFlag: (): Promise<{ enabled: boolean }> => {
    return ipcRenderer.invoke('read-realtime-inference-flag')
  },

  setRealtimeTouchInference: (
    enabled: boolean
  ): Promise<{
    enabled: boolean
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    officialUseCuratedClips: boolean
    activeSampleName: string | null
    activeSampleKind: 'official' | 'custom' | null
  }> => {
    return ipcRenderer.invoke('set-realtime-touch-inference', enabled)
  },

  openHome: (): void => {
    ipcRenderer.send('open-home')
  },

  quitApp: (): void => {
    ipcRenderer.send('quit-app')
  },

  readTouchConfig: (): Promise<{
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    corpus: Record<string, string[]>
  }> => {
    return ipcRenderer.invoke('read-touch-config')
  },

  readTtsCapabilities: (): Promise<{
    configuredEngine: string
    voiceForgeSupported: boolean
    hint: string | null
  }> => {
    return ipcRenderer.invoke('read-tts-capabilities')
  },

  getLive2DModelUrl: (): Promise<string> => {
    return ipcRenderer.invoke('get-live2d-model-url')
  },

  readVoiceForgeConfig: (): Promise<{
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    corpus: Record<string, string[]>
    instruct: string
    activeSample: {
      folderId: string
      displayName: string
      pending?: boolean
      kind?: 'official' | 'custom'
    } | null
    officialUseCuratedClips: boolean
  }> => {
    return ipcRenderer.invoke('read-voice-forge-config')
  },

  readSampleCorpus: (folderId: string): Promise<Record<string, string[]>> => {
    return ipcRenderer.invoke('read-sample-corpus', folderId)
  },

  writeTouchConfig: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: Record<string, string[]>
  ): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('write-touch-config', mode, corpus)
  },

  writeVoiceForgeConfig: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: Record<string, string[]>,
    instruct: string
  ): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('write-voice-forge-config', mode, corpus, instruct)
  },

  prepareVoiceCreation: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: Record<string, string[]>,
    instruct: string,
    displayName: string
  ): Promise<{ folderId: string; displayName: string; pending?: boolean }> => {
    return ipcRenderer.invoke('prepare-voice-creation', mode, corpus, instruct, displayName)
  },

  readExperimentalVoiceUpload: (): Promise<{ enabled: boolean }> => {
    return ipcRenderer.invoke('read-experimental-voice-upload')
  },

  setExperimentalVoiceUpload: (enabled: boolean): Promise<{ enabled: boolean }> => {
    return ipcRenderer.invoke('set-experimental-voice-upload', enabled)
  },

  pickVoiceUploadWav: (): Promise<{ fileName: string } | null> => {
    return ipcRenderer.invoke('pick-voice-upload-wav')
  },

  cancelVoiceUploadStaging: (): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('cancel-voice-upload-staging')
  },

  prepareVoiceUpload: (payload: {
    displayName: string
    corpus: Record<string, string[]>
    referenceText: string
  }): Promise<{ folderId: string; displayName: string; pending?: boolean }> => {
    return ipcRenderer.invoke('prepare-voice-upload', payload)
  },

  showRiskConfirmDialog: (options: {
    title: string
    message: string
    cancelLabel: string
    confirmLabel: string
  }): Promise<boolean> => {
    return ipcRenderer.invoke('show-risk-confirm-dialog', options)
  },

  requestVoiceModelRegeneration: (): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('request-voice-model-regeneration')
  },

  listVoiceSamples: (): Promise<
    Array<{
      folderId: string
      displayName: string
      kind: 'official' | 'custom'
      hasReference: boolean
    }>
  > => {
    return ipcRenderer.invoke('list-voice-samples')
  },

  switchVoiceSample: (
    folderId: string
  ): Promise<{ folderId: string; displayName: string; kind?: 'official' | 'custom'; touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus' }> => {
    return ipcRenderer.invoke('switch-voice-sample', folderId)
  },

  deleteVoiceSample: (
    folderId: string
  ): Promise<{ ok: boolean; wasActive: boolean; touchMode: TouchFeedbackMode }> => {
    return ipcRenderer.invoke('delete-voice-sample', folderId)
  },

  cancelVoiceForgeReview: (): Promise<{
    ok: boolean
    removedFolderId: string | null
    touchMode: TouchFeedbackMode
  }> => {
    return ipcRenderer.invoke('cancel-voice-forge-review')
  },

  completeVoiceSwitch: (payload: {
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
    prewarm?: boolean
  }): Promise<{ ok: boolean }> => {
    return ipcRenderer.invoke('complete-voice-switch', payload)
  },

  applyCorpusPrewarm: (
    folderId: string,
    corpus: Record<string, string[]>
  ): Promise<{ folderId: string; displayName: string; kind?: 'official' | 'custom' }> => {
    return ipcRenderer.invoke('apply-corpus-prewarm', folderId, corpus)
  },

  applyAltEngineCorpus: (
    corpus: Record<string, string[]>
  ): Promise<{ ok: true; mode: 'alt_engine_corpus'; engine: string }> => {
    return ipcRenderer.invoke('apply-alt-engine-corpus', corpus)
  },

  disableAltEngineCorpus: (): Promise<{ touchMode: 'curated' }> => {
    return ipcRenderer.invoke('disable-alt-engine-corpus')
  },

  showConfirmDialog: (options: {
    title: string
    message: string
    confirmLabel?: string
  }): Promise<boolean> => {
    return ipcRenderer.invoke('show-confirm-dialog', options)
  },

  relaunchApp: (): Promise<{ ok: boolean; mode?: 'reload' | 'relaunch' }> => {
    return ipcRenderer.invoke('relaunch-app')
  }
})
