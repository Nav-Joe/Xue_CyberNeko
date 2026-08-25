/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

type WindowType = 'pet' | 'home' | 'chat'

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
  showInfoDialog: (options: {
    title: string
    message: string
    okLabel?: string
  }) => Promise<void>
  relaunchApp: () => Promise<{ ok: boolean; mode?: 'reload' | 'relaunch' }>
  readCharacterCards: () => Promise<import('./services/chat/types').CharacterCardsStore>
  writeCharacterCards: (store: import('./services/chat/types').CharacterCardsStore) => Promise<{ ok: true }>
  readChatConfig: () => Promise<import('./services/chat/types').ChatConfigView>
  writeChatConfig: (
    config: import('./services/chat/types').ChatConfigView & { apiKey?: string; clearApiKey?: boolean }
  ) => Promise<import('./services/chat/types').ChatConfigView>
  chatOpenAiCompletion: (payload: {
    messages: import('./services/chat/types').ChatHistoryMessage[]
    model: string
    stream?: boolean
    temperature?: number
    outputFormat: import('./services/chat/types').ChatOutputFormat
  }) => Promise<{ ok: true; content: string } | { ok: false; detail?: string; status?: number }>
  chatOpenAiListModels: () => Promise<
    { ok: true; models: string[] } | { ok: false; detail?: string; status?: number }
  >
  onChatLlamaBootstrapProgress: (
    callback: (payload: {
      phase: string
      message: string
      progress?: { done: number; total: number }
    }) => void
  ) => () => void
  beginChatLlamaSession: (options?: {
    downloadModel?: boolean
  }) => Promise<
    | {
        ok: true
        autoDownloadedServer: boolean
        autoDownloadedModel: boolean
        noticeMessage?: string
        modelPath?: string
        baseUrl?: string
        hasLocalModelFile: boolean
        serverRunning: boolean
      }
    | { ok: false; detail: string }
  >
  getLocalModelStatus: () => Promise<{
    hasLocalModelFile: boolean
    modelPath: string | null
    modelFilename: string | null
    defaultModelId: string
  }>
  probeLocalLlamaServer: () => Promise<{ serverRunning: boolean; baseUrl?: string }>
  downloadLocalModel: () => Promise<
    | {
        ok: true
        modelPath: string
        downloaded: boolean
        baseUrl?: string
        serverStarted: boolean
      }
    | { ok: false; detail: string; cancelled?: boolean }
  >
  cancelLocalModelDownload: () => Promise<{ ok: true; detail: string }>
  reconcileInterruptedLlamaDownloads: () => Promise<{ ok: true; cleaned: boolean }>
  endChatLlamaSession: () => Promise<{ ok: boolean }>
  openChatWindow: (options?: {
    entryOrigin?: 'home' | 'pet'
  }) => Promise<{ ok: true; alreadyOpen: boolean }>
  focusChatWindow: () => Promise<{ ok: true; focused: boolean }>
  closeChatWindow: () => Promise<{ ok: true }>
  memoryGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    memoryConsolidateOnChatClose: boolean
    memoryLlmSummarizeEnabled?: boolean
    memoryEmotionScoreEnabled?: boolean
  }>
  memoryAppendRawLog: (payload: {
    sessionId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: number
  }) => Promise<{ ok: true; id: string } | { ok: false; detail: string }>
  memoryListTimeline: (payload?: {
    layer?: string
    limit?: number
  }) => Promise<
    | { ok: true; items: import('./services/memory/types').MemoryTimelineItem[] }
    | { ok: false; detail: string }
  >
  memoryGetRecentHistory: (payload: {
    maxRounds: number
  }) => Promise<
    | { ok: true; messages: import('./services/chat/types').ChatHistoryMessage[] }
    | { ok: false; detail: string }
  >
  memoryGetPromptContext: (payload: {
    userInput: string
    summaryLimit?: number
  }) => Promise<
    | {
        ok: true
        coreMemories: Array<{ id: string; content: string; category: string; weight: number }>
        userProfileBlock?: string
        summaries: Array<{
          id: string
          summary: string
          significance: number
          keywords: string[]
          score: number
        }>
        summaryTokensUsed?: number
        block: string
      }
    | { ok: false; detail: string }
  >
  memoryConsumePendingPeeks: () => Promise<
    | { ok: true; prefix: string; count: number; stamps: string[] }
    | { ok: false; detail: string }
  >
  memoryMaybePeriodRollup: () => Promise<
    | {
        ok: true
        weeklyDone: number
        monthlyDone: number
        profileUpdated: boolean
        skipped?: string
      }
    | { ok: false; detail: string }
  >
  memoryMaybeMidSessionConsolidate: (payload: {
    sessionId: string
  }) => Promise<
    | {
        ok: true
        triggered: true
        summaryId: string
        prunedRounds: number
        remainingRounds: number
        significance?: number
        corePromoted?: boolean
      }
    | {
        ok: true
        triggered: false
        reason: 'below_threshold' | 'empty'
        rounds?: number
        softMax?: number
      }
    | { ok: false; reason?: string; detail?: string }
  >
  memoryRecordPeek: () => Promise<
    | {
        ok: true
        recorded: true
        eventId: string
        atMs: number
        stamp: string
      }
    | { ok: false; detail: string }
  >
  memoryNotifyChatClosed: (payload?: { sessionId?: string }) => Promise<{ ok: true }>
  desireGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    desireEnabled: boolean
    active: boolean
  }>
  desireGetPromptBlock: (payload?: {
    nowMs?: number
  }) => Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }>
  desireInsertTest: (payload: {
    name: string
    description?: string
    intensity?: number
    patienceMax?: number
    patienceRemaining?: number
  }) => Promise<{ ok: true; id: string } | { ok: false; detail: string }>
  desireApplyAfterTurn: (payload: {
    userText: string
    assistantText: string
  }) => Promise<
    | { ok: true; skipped?: string; createdIds?: string[]; touched?: number }
    | { ok: false; detail: string }
  >
  relationshipGetStatus: () => Promise<{
    ready: boolean
    memoryEnabled: boolean
    relationshipEnabled: boolean
    active: boolean
  }>
  relationshipGetPromptBlock: () => Promise<
    { ok: true; block: string } | { ok: false; detail: string; block: string }
  >
  relationshipGetSnapshot: (payload?: {
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        scores: { closeness: number; trust: number; rapport: number }
        tags: { closeness: string; trust: string; rapport: string }
        netToday: { closeness: number; trust: number; rapport: number }
      }
    | { ok: false; detail: string }
  >
  relationshipApplyEval: (payload: {
    rounds: Array<{ userText: string; assistantText: string }>
    source: 'llm_turn' | 'chat_close'
  }) => Promise<{ ok: true; skipped?: string; applied?: number } | { ok: false; detail: string }>
  petTouchGetToday: (payload?: {
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<'head' | 'arms' | 'body' | 'legs' | 'tail', number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
      }
    | { ok: false; detail: string }
  >
  petTouchGetPromptBlock: (payload?: {
    nowMs?: number
  }) => Promise<{ ok: true; block: string } | { ok: false; detail: string; block: string }>
  petTouchRecord: (payload: {
    part: 'head' | 'arms' | 'body' | 'legs' | 'tail'
    nowMs?: number
  }) => Promise<
    | {
        ok: true
        dayKey: string
        counts: Record<'head' | 'arms' | 'body' | 'legs' | 'tail', number>
        total: number
        affectionGrants: number
        affectionCap: number
        affectionEnabled: boolean
        affectionGranted?: boolean
      }
    | { ok: false; detail: string }
  >
  reportClientError: (payload: {
    scope?: string
    message: string
    detail?: string
    stack?: string
    url?: string
    windowType?: string
  }) => Promise<{ ok: boolean }>
  logRendererInfo: (payload: {
    scope?: string
    message: string
    detail?: string
  }) => Promise<{ ok: boolean }>
}

interface Window {
  electronAPI: ElectronAPI
}
