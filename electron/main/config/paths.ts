import { existsSync } from 'fs'
import { join } from 'path'

import { readConfiguredTtsEngine } from '../ttsEngineInfo'

import { OFFICIAL_SAMPLE_ID, RUNTIME_ARTIFACTS } from './types/runtime-config'

export const CORPUS_SNAPSHOT_NAME = 'corpus.snapshot.json'
export const ALT_ENGINE_PREWARM_TARGET = '__alt_engine__'
export const TOUCH_CACHE_DIR_NAME = 'touch_cache'
export const TOUCH_CACHE_POINTER_NAME = 'touch_cache.json'

export function projectRoot(): string {
  const candidates = [
    process.cwd(),
    join(__dirname, '..', '..', '..'),
    join(__dirname, '..', '..'),
    join(__dirname, '..')
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'voice_forge'))) {
      return dir
    }
  }
  return process.cwd()
}

export function runtimeDir(): string {
  return join(projectRoot(), '.runtime')
}

export function touchModeFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.touchMode)
}

export function customCorpusFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.customCorpus)
}

export function voiceForgeRoot(): string {
  return join(projectRoot(), 'voice_forge')
}

export function customSampleRoot(): string {
  return join(voiceForgeRoot(), 'custom_sample')
}

export function defaultSampleDir(): string {
  return join(voiceForgeRoot(), 'default_sample')
}

export function sampleDirForId(folderId: string): string {
  if (folderId === OFFICIAL_SAMPLE_ID) {
    return defaultSampleDir()
  }
  return join(customSampleRoot(), folderId)
}

export function altEngineCacheRoot(engine?: string): string {
  const name = (engine ?? readConfiguredTtsEngine()).trim() || 'unknown'
  return join(voiceForgeRoot(), 'other_custom_cache', name)
}

export function regenerateVoiceModelFlagFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.regenerateModel)
}

export function corpusPrewarmFlagFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.corpusPrewarm)
}

export function realtimeInferenceFlagFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.realtimeInference)
}

export function experimentalVoiceUploadFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.experimentalUpload)
}

export function voiceForgeFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.voiceForge)
}

export function voiceForgeSessionFile(): string {
  return join(runtimeDir(), RUNTIME_ARTIFACTS.voiceForgeSession)
}

export function qwenConfigFile(): string {
  return join(projectRoot(), 'tts_voice', 'qwen_config.json')
}

export function defaultCorpusFile(): string {
  return join(projectRoot(), 'src', 'data', 'corpus.json')
}
