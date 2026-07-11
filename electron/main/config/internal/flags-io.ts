import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'

import {
  corpusPrewarmFlagFile,
  experimentalVoiceUploadFile,
  realtimeInferenceFlagFile,
  regenerateVoiceModelFlagFile,
  runtimeDir
} from '../paths'

export function writeRealtimeInferenceFlag(enabled: boolean): void {
  mkdirSync(runtimeDir(), { recursive: true })
  if (enabled) {
    writeFileSync(realtimeInferenceFlagFile(), '1\n', 'utf8')
  } else if (existsSync(realtimeInferenceFlagFile())) {
    rmSync(realtimeInferenceFlagFile(), { force: true })
  }
}

export function readRealtimeInferenceFlag(): boolean {
  const flagPath = realtimeInferenceFlagFile()
  if (!existsSync(flagPath)) {
    return false
  }
  return readFileSync(flagPath, 'utf8').trim() === '1'
}

export function markCorpusPrewarmPending(folderId: string): void {
  const normalized = folderId.trim()
  if (!normalized) {
    throw new Error('语料预热目标声线无效')
  }
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(corpusPrewarmFlagFile(), `${normalized}\n`, 'utf8')
}

export function clearRegenerateVoiceModelFlag(): void {
  const regenFlag = regenerateVoiceModelFlagFile()
  if (existsSync(regenFlag)) {
    rmSync(regenFlag, { force: true })
  }
}

export function writeRegenerateVoiceModelFlag(): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(regenerateVoiceModelFlagFile(), '1\n', 'utf8')
}

export function readExperimentalVoiceUploadEnabled(): boolean {
  const filePath = experimentalVoiceUploadFile()
  if (!existsSync(filePath)) {
    return false
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as { enabled?: boolean }
    return data.enabled === true
  } catch {
    return false
  }
}

export function writeExperimentalVoiceUploadEnabled(enabled: boolean): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(experimentalVoiceUploadFile(), `${JSON.stringify({ enabled }, null, 2)}\n`, 'utf8')
}

/** 每次启动应用时重置实验功能开关（会话内仍可手动开启）。 */
export function resetExperimentalFeaturesOnStartup(): void {
  writeExperimentalVoiceUploadEnabled(false)
}
