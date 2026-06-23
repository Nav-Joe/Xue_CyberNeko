/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

type WindowType = 'pet' | 'home'

interface ElectronAPI {
  platform: NodeJS.Platform
  getWindowType: () => WindowType
  setIgnoreMouseEvents: (ignore: boolean) => void
  getPetWindowPosition: () => Promise<{ x: number; y: number }>
  setPetWindowSize: (width: number, height: number) => Promise<{ width: number; height: number }>
  setPetWindowOverlay: (width: number, height: number, recenter?: boolean) => Promise<{ width: number; height: number }>
  setPetWindowPosition: (x: number, y: number) => void
  onHomeVisibilityChanged: (callback: (visible: boolean) => void) => () => void
  onVoiceConfigChanged: (
    callback: (payload: {
      touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
      loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
      prewarm?: boolean
    }) => void
  ) => () => void
  onVoiceSamplesChanged: (callback: () => void) => () => void
  notifyVoiceSamplesChanged: () => Promise<{ ok: boolean }>
  setOfficialTouchPlayback: (
    useCuratedClips: boolean
  ) => Promise<{ ok: boolean; touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'; officialUseCuratedClips: boolean }>
  checkOfficialTouchCacheReady: () => Promise<{ ready: boolean }>
  readRealtimeInferenceFlag: () => Promise<{ enabled: boolean }>
  setRealtimeTouchInference: (enabled: boolean) => Promise<{
    enabled: boolean
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    officialUseCuratedClips: boolean
    activeSampleName: string | null
    activeSampleKind: 'official' | 'custom' | null
  }>
  openHome: () => void
  quitApp: () => void
  readTouchConfig: () => Promise<{ mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus' | 'alt_engine_corpus'; corpus: import('./types/corpus').CorpusData }>
  readTtsCapabilities: () => Promise<{
    configuredEngine: string
    voiceForgeSupported: boolean
    hint: string | null
  }>
  getLive2DModelUrl: () => Promise<string>
  readVoiceForgeConfig: () => Promise<{
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    corpus: import('./types/corpus').CorpusData
    instruct: string
    activeSample: { folderId: string; displayName: string; pending?: boolean; kind?: 'official' | 'custom' } | null
    officialUseCuratedClips: boolean
  }>
  readSampleCorpus: (folderId: string) => Promise<import('./types/corpus').CorpusData>
  writeTouchConfig: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: import('./types/corpus').CorpusData
  ) => Promise<{ ok: boolean }>
  writeVoiceForgeConfig: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: import('./types/corpus').CorpusData,
    instruct: string
  ) => Promise<{ ok: boolean }>
  prepareVoiceCreation: (
    mode: 'curated' | 'custom_corpus' | 'alt_engine_corpus',
    corpus: import('./types/corpus').CorpusData,
    instruct: string,
    displayName: string
  ) => Promise<{ folderId: string; displayName: string; pending?: boolean }>
  readExperimentalVoiceUpload: () => Promise<{ enabled: boolean }>
  setExperimentalVoiceUpload: (enabled: boolean) => Promise<{ enabled: boolean }>
  pickVoiceUploadWav: () => Promise<{ fileName: string } | null>
  cancelVoiceUploadStaging: () => Promise<{ ok: boolean }>
  prepareVoiceUpload: (payload: {
    displayName: string
    corpus: import('./types/corpus').CorpusData
    referenceText: string
  }) => Promise<{ folderId: string; displayName: string; pending?: boolean }>
  showRiskConfirmDialog: (options: {
    title: string
    message: string
    cancelLabel: string
    confirmLabel: string
  }) => Promise<boolean>
  requestVoiceModelRegeneration: () => Promise<{ ok: boolean }>
  listVoiceSamples: () => Promise<
    Array<{
      folderId: string
      displayName: string
      kind: 'official' | 'custom'
      hasReference: boolean
    }>
  >
  switchVoiceSample: (
    folderId: string
  ) => Promise<{ folderId: string; displayName: string; kind?: 'official' | 'custom'; touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus' }>
  deleteVoiceSample: (
    folderId: string
  ) => Promise<{ ok: boolean; wasActive: boolean; touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus' }>
  cancelVoiceForgeReview: () => Promise<{
    ok: boolean
    removedFolderId: string | null
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
  }>
  completeVoiceSwitch: (payload: {
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    loadMode?: 'curated' | 'engine' | 'prewarm' | 'realtime'
    prewarm?: boolean
  }) => Promise<{ ok: boolean }>
  beginVoiceEngineLoad: (payload: {
    title: string
    message: string
    mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
    sync?: boolean
    expectedTouchMode?: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
    syncMessage?: string
  }) => Promise<{ ok: boolean }>
  onVoiceEngineLoadBegin: (
    callback: (payload: {
      title: string
      message: string
      mode: 'curated' | 'engine' | 'prewarm' | 'realtime'
      sync?: boolean
      expectedTouchMode?: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
      syncMessage?: string
    }) => void
  ) => () => void
  notifyVoiceEngineLoadFinished: (result: { ok: boolean }) => void
  applyCorpusPrewarm: (
    folderId: string,
    corpus: import('./types/corpus').CorpusData
  ) => Promise<{
    folderId: string
    displayName: string
    kind?: 'official' | 'custom'
    runtimeUnchanged: boolean
    touchMode: 'curated' | 'custom_corpus' | 'alt_engine_corpus'
  }>
  applyAltEngineCorpus: (
    corpus: import('./types/corpus').CorpusData
  ) => Promise<{ ok: true; mode: 'alt_engine_corpus'; engine: string }>
  disableAltEngineCorpus: () => Promise<{ touchMode: 'curated' }>
  showConfirmDialog: (options: {
    title: string
    message: string
    confirmLabel?: string
  }) => Promise<boolean>
  relaunchApp: () => Promise<{ ok: boolean; mode?: 'reload' | 'relaunch' }>
}

interface Window {
  electronAPI: ElectronAPI
}
