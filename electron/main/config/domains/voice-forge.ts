import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../../src/types/corpus'

import { readSampleCorpus } from '../internal/corpus-utils'
import {
  readSampleInstruct,
  sampleHasReference,
  writeSampleInstruct
} from '../internal/sample-utils'
import {
  defaultSampleDir,
  qwenConfigFile,
  runtimeDir,
  sampleDirForId,
  TOUCH_CACHE_DIR_NAME,
  TOUCH_CACHE_POINTER_NAME,
  voiceForgeFile
} from '../paths'
import { readAltEngineCorpus, readTouchConfig, writeTouchConfig } from './touch'
import type {
  TouchFeedbackMode,
  VoiceForgeRuntimeView,
  VoiceSampleProfile
} from '../types/runtime-config'
import { OFFICIAL_SAMPLE_ID } from '../types/runtime-config'

export function isOfficialSampleProfile(profile: VoiceSampleProfile | null | undefined): boolean {
  if (!profile) {
    return true
  }
  return profile.folderId === OFFICIAL_SAMPLE_ID || profile.kind === 'official'
}

export function readOfficialUseCuratedClips(data: Record<string, unknown>): boolean {
  if (typeof data.officialUseCuratedClips === 'boolean') {
    return data.officialUseCuratedClips
  }
  return true
}

function touchModeForOfficialSample(data: Record<string, unknown>): TouchFeedbackMode {
  return readOfficialUseCuratedClips(data) ? 'curated' : 'custom_corpus'
}

export function readVoiceForgeJson(): Record<string, unknown> {
  if (!existsSync(voiceForgeFile())) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(voiceForgeFile(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readDefaultInstruct(): string {
  if (!existsSync(qwenConfigFile())) {
    return ''
  }
  const data = JSON.parse(readFileSync(qwenConfigFile(), 'utf8')) as { instruct?: string }
  return typeof data.instruct === 'string' ? data.instruct : ''
}

export function resolveInstructForSample(
  profile: VoiceSampleProfile,
  config: Record<string, unknown>
): string {
  if (isOfficialSampleProfile(profile)) {
    return readDefaultInstruct()
  }
  const fromProfile = readSampleInstruct(sampleDirForId(profile.folderId))
  if (fromProfile) {
    return fromProfile
  }
  const raw = config.instruct
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  return readDefaultInstruct()
}

export function preserveCustomInstructFromConfig(
  previousActive: VoiceSampleProfile | null | undefined,
  config: Record<string, unknown>
): void {
  if (!previousActive || isOfficialSampleProfile(previousActive)) {
    return
  }
  const raw = config.instruct
  if (typeof raw !== 'string' || !raw.trim()) {
    return
  }
  const official = readDefaultInstruct().trim()
  if (raw.trim() === official) {
    return
  }
  writeSampleInstruct(sampleDirForId(previousActive.folderId), raw.trim())
}

export function readVoiceForgeConfig(): VoiceForgeRuntimeView {
  const { mode } = readTouchConfig()
  const data = readVoiceForgeJson()
  const instructRaw = data.instruct
  let instruct =
    typeof instructRaw === 'string' && instructRaw.trim() ? instructRaw.trim() : readDefaultInstruct()
  const activeRaw = data.activeSample
  const activeSample =
    activeRaw &&
    typeof activeRaw === 'object' &&
    typeof (activeRaw as VoiceSampleProfile).folderId === 'string' &&
    typeof (activeRaw as VoiceSampleProfile).displayName === 'string'
      ? (activeRaw as VoiceSampleProfile)
      : null

  if (activeSample) {
    instruct = resolveInstructForSample(activeSample, data)
  }

  const corpus =
    mode === 'alt_engine_corpus'
      ? readAltEngineCorpus()
      : activeSample?.folderId?.trim()
        ? readSampleCorpus(activeSample.folderId)
        : readTouchConfig().corpus

  return {
    mode,
    corpus,
    instruct,
    activeSample,
    officialUseCuratedClips: readOfficialUseCuratedClips(data)
  }
}

export function writeVoiceForgeConfig(
  mode: TouchFeedbackMode,
  corpus: CorpusData,
  instruct: string,
  sampleProfile?: VoiceSampleProfile,
  options?: { officialUseCuratedClips?: boolean }
): void {
  mkdirSync(runtimeDir(), { recursive: true })

  const existing = readVoiceForgeJson()
  const payload: Record<string, unknown> = {
    instruct: instruct.trim()
  }

  if (sampleProfile) {
    payload.activeSample = {
      folderId: sampleProfile.folderId,
      displayName: sampleProfile.displayName,
      kind: sampleProfile.kind ?? (sampleProfile.folderId === OFFICIAL_SAMPLE_ID ? 'official' : 'custom'),
      pending: sampleProfile.pending ?? false
    }
  }

  if (options?.officialUseCuratedClips !== undefined) {
    payload.officialUseCuratedClips = options.officialUseCuratedClips
  } else if (typeof existing.officialUseCuratedClips === 'boolean') {
    payload.officialUseCuratedClips = existing.officialUseCuratedClips
  } else if (sampleProfile && isOfficialSampleProfile(sampleProfile)) {
    payload.officialUseCuratedClips = mode === 'curated'
  }

  // 先写 voice-forge.json（含 officialUseCuratedClips），再写 touch-mode.env，
  // 避免 TTS reconcile 读到 custom_corpus + officialUseCuratedClips=true 的组合。
  writeFileSync(voiceForgeFile(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  writeTouchConfig(mode, corpus)
}

export function isOfficialTouchCacheReady(): boolean {
  const sampleDir = defaultSampleDir()
  const pointerPath = join(sampleDir, TOUCH_CACHE_POINTER_NAME)
  if (existsSync(pointerPath)) {
    try {
      const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { ready?: boolean }
      if (pointer.ready === true) {
        return true
      }
    } catch {
      // fall through
    }
  }

  const cacheDir = join(sampleDir, TOUCH_CACHE_DIR_NAME)
  const manifestPath = join(cacheDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return false
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries?: Record<string, { key?: string }>
    }
    const entries = manifest.entries
    if (!entries) {
      return false
    }
    for (const entry of Object.values(entries)) {
      const key = entry?.key?.trim()
      if (!key) {
        continue
      }
      if (existsSync(join(cacheDir, key, '0.wav'))) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

export { touchModeForOfficialSample, readDefaultInstruct, sampleHasReference }
