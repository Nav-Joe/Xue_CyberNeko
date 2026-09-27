import { ipcRenderer } from 'electron'

import type { TtsCloudConfigPatch, TtsCloudConfigView } from '../main/ttsCloud/types'

type GetConfigResult =
  | { ok: true; config: TtsCloudConfigView }
  | { ok: false; detail: string }

type SetConfigResult =
  | { ok: true; config: TtsCloudConfigView }
  | { ok: false; detail: string }

type PreviewResult =
  | { ok: true; audio: ArrayBuffer; mime: string }
  | { ok: false; detail: string }

type VoiceOpResult =
  | {
      ok: true
      voiceId: string
      localId: string
      config: TtsCloudConfigView
      previewAudio?: ArrayBuffer
      previewMime?: string
    }
  | { ok: false; detail: string }

type RemoveResult =
  | { ok: true; config: TtsCloudConfigView; remoteDeleted: boolean }
  | { ok: false; detail: string }

/**
 * 云端 TTS preload（避免继续堆 preload/index.ts）。
 * 扁平挂到 `window.electronAPI`。
 */
export const ttsCloudApi = {
  getTtsCloudConfig: (): Promise<GetConfigResult> => {
    return ipcRenderer.invoke('tts-cloud-get-config')
  },

  setTtsCloudConfig: (patch: TtsCloudConfigPatch): Promise<SetConfigResult> => {
    return ipcRenderer.invoke('tts-cloud-set-config', patch)
  },

  enrollOfficialTtsCloud: (): Promise<VoiceOpResult> => {
    return ipcRenderer.invoke('tts-cloud-enroll-official')
  },

  enrollCustomTtsCloud: (payload: {
    displayName: string
    referenceText?: string
  }): Promise<VoiceOpResult> => {
    return ipcRenderer.invoke('tts-cloud-enroll-custom', payload)
  },

  designTtsCloudVoice: (payload: {
    displayName: string
    voicePrompt: string
    previewText?: string
    stageOnly?: boolean
    corpus?: import('../../src/types/corpus').CorpusData
  }): Promise<VoiceOpResult> => {
    return ipcRenderer.invoke('tts-cloud-design-voice', payload)
  },

  getTtsCloudPendingPreview: (): Promise<PreviewResult> => {
    return ipcRenderer.invoke('tts-cloud-get-pending-preview')
  },

  getTtsCloudPendingStatus: (): Promise<
    | {
        ok: true
        status: {
          review_pending: boolean
          phase: string | null
          flow: string | null
          source: string | null
          displayName: string | null
          folderId: string | null
          reference_ready: boolean
          ready: boolean
          backend: 'cloud'
        } | null
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('tts-cloud-get-pending-status')
  },

  approveTtsCloudPending: (): Promise<
    | {
        ok: true
        localId: string
        voiceId: string
        corpus: import('../../src/types/corpus').CorpusData
        config: TtsCloudConfigView
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('tts-cloud-approve-pending')
  },

  rejectTtsCloudPending: (payload: {
    action: 'regenerate' | 'skip'
  }): Promise<
    | {
        ok: true
        action: 'regenerate' | 'skip'
        pending: {
          kind: 'vc' | 'vd'
          displayName: string
          voiceId: string
          voicePrompt: string
          previewText: string
          corpus: import('../../src/types/corpus').CorpusData
          createdAt: number
        } | null
        config: TtsCloudConfigView
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('tts-cloud-reject-pending', payload)
  },

  removeTtsCloudVoice: (payload: {
    localId: string
    deleteRemote?: boolean
  }): Promise<RemoveResult> => {
    return ipcRenderer.invoke('tts-cloud-remove-voice', payload)
  },

  previewTtsCloud: (payload: { text: string }): Promise<PreviewResult> => {
    return ipcRenderer.invoke('tts-cloud-preview', payload)
  },

  synthesizeTtsCloud: (payload: { text: string }): Promise<PreviewResult> => {
    return ipcRenderer.invoke('tts-cloud-synthesize', payload)
  },

  getTtsCloudCorpus: (payload?: {
    localId?: string
  }): Promise<
    | { ok: true; localId: string; corpus: import('../../src/types/corpus').CorpusData }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('tts-cloud-get-corpus', payload)
  },

  prewarmTtsCloudCorpus: (payload: {
    corpus: import('../../src/types/corpus').CorpusData
    localId?: string
  }): Promise<
    | {
        ok: true
        localId: string
        synthesized: number
        skipped: number
        failed: number
        total: number
        touchMode: 'custom_corpus'
        corpus: import('../../src/types/corpus').CorpusData
        config: TtsCloudConfigView
        failures: Array<{ line: string; detail: string }>
      }
    | { ok: false; detail: string }
  > => {
    return ipcRenderer.invoke('tts-cloud-prewarm-corpus', payload)
  },

  getTtsCloudCacheAudio: (payload: {
    text: string
  }): Promise<PreviewResult> => {
    return ipcRenderer.invoke('tts-cloud-get-cache-audio', payload)
  }
}
