// --- types ---
export type {
  TouchFeedbackMode,
  VoiceSampleProfile,
  VoiceSampleEntry,
  VoiceForgeSession,
  VoiceForgeSessionPhase,
  VoiceForgeSessionFlow,
  VoiceForgeJson,
  TouchConfigView,
  VoiceForgeRuntimeView,
  CorpusPrewarmResult
} from './types/runtime-config'

export {
  OFFICIAL_SAMPLE_ID,
  OFFICIAL_SAMPLE_LABEL,
  RUNTIME_ARTIFACTS
} from './types/runtime-config'

// --- touch ---
export { readTouchConfig, writeTouchConfig } from './domains/touch'

// --- corpus ---
export { readSampleCorpus } from './domains/voice-samples'
export {
  applyCorpusPrewarm,
  applyAltEngineCorpus,
  disableAltEngineCorpus
} from './domains/corpus'

// --- voice forge & samples ---
export {
  readVoiceForgeConfig,
  writeVoiceForgeConfig,
  isOfficialSampleProfile,
  isOfficialTouchCacheReady
} from './domains/voice-forge'

export {
  listVoiceSamples,
  switchVoiceSample,
  deleteVoiceSample,
  generateSampleFolderId
} from './domains/voice-samples'

// --- voice flow ---
export {
  prepareVoiceCreation,
  prepareVoiceUpload,
  cancelVoiceForgeReview,
  requestVoiceModelRegeneration
} from './domains/voice-flow'

// --- playback & flags ---
export {
  setOfficialTouchPlayback,
  setRealtimeTouchInference,
  readRealtimeInferenceFlag
} from './domains/touch-playback'

// --- experimental ---
export {
  readExperimentalVoiceUploadEnabled,
  writeExperimentalVoiceUploadEnabled,
  resetExperimentalFeaturesOnStartup
} from './domains/experimental'

// --- reconcile ---
export { reconcileVoiceRuntimeConfig } from './reconcile'
