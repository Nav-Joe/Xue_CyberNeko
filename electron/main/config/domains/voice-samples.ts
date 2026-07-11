import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'

import { readSampleCorpus } from '../internal/corpus-utils'
import {
  clearRegenerateVoiceModelFlag,
  writeRealtimeInferenceFlag
} from '../internal/flags-io'
import { clearVoiceForgeSession } from '../internal/session-io'
import {
  generateSampleFolderId,
  readProfileDisplayName,
  sampleHasReference,
  writeSampleInstruct
} from '../internal/sample-utils'
import {
  customSampleRoot,
  defaultSampleDir,
  sampleDirForId
} from '../paths'
import { readTouchConfig } from './touch'
import {
  isOfficialSampleProfile,
  preserveCustomInstructFromConfig,
  readVoiceForgeConfig,
  readVoiceForgeJson,
  resolveInstructForSample,
  touchModeForOfficialSample,
  writeVoiceForgeConfig
} from './voice-forge'
import type { TouchFeedbackMode, VoiceSampleEntry, VoiceSampleProfile } from '../types/runtime-config'
import { OFFICIAL_SAMPLE_ID, OFFICIAL_SAMPLE_LABEL } from '../types/runtime-config'

export { generateSampleFolderId }

export function listVoiceSamples(): VoiceSampleEntry[] {
  const items: VoiceSampleEntry[] = []
  const officialDir = defaultSampleDir()
  if (sampleHasReference(officialDir)) {
    items.push({
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      hasReference: true
    })
  }

  const customRoot = customSampleRoot()
  if (existsSync(customRoot)) {
    for (const name of readdirSync(customRoot)) {
      const dirPath = join(customRoot, name)
      if (!statSync(dirPath).isDirectory()) {
        continue
      }
      if (!sampleHasReference(dirPath)) {
        continue
      }
      items.push({
        folderId: name,
        displayName: readProfileDisplayName(dirPath, name),
        kind: 'custom',
        hasReference: true
      })
    }
  }

  return items
}

export function switchVoiceSample(folderId: string): VoiceSampleProfile & { touchMode: TouchFeedbackMode } {
  const target = listVoiceSamples().find((item) => item.folderId === folderId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (!target.hasReference) {
    throw new Error('该音色尚未生成参考音频，请先在音色工坊完成创建')
  }

  const corpus = readSampleCorpus(folderId)
  const config = readVoiceForgeJson()
  const previousActive =
    config.activeSample &&
    typeof config.activeSample === 'object' &&
    typeof (config.activeSample as VoiceSampleProfile).folderId === 'string'
      ? (config.activeSample as VoiceSampleProfile)
      : null
  const profile: VoiceSampleProfile = {
    folderId: target.folderId,
    displayName: target.displayName,
    kind: target.kind,
    pending: false
  }
  const instruct = resolveInstructForSample(profile, config)

  const data = readVoiceForgeJson()
  const touchMode: TouchFeedbackMode =
    target.folderId === OFFICIAL_SAMPLE_ID || target.kind === 'official'
      ? touchModeForOfficialSample(data)
      : 'custom_corpus'

  if (isOfficialSampleProfile(profile)) {
    preserveCustomInstructFromConfig(previousActive, config)
  }

  writeVoiceForgeConfig(touchMode, corpus, instruct, profile, {
    officialUseCuratedClips: touchMode === 'curated'
  })

  if (touchMode === 'curated') {
    writeRealtimeInferenceFlag(false)
  }

  if (!isOfficialSampleProfile(profile)) {
    writeSampleInstruct(sampleDirForId(profile.folderId), instruct)
  }

  clearVoiceForgeSession()
  clearRegenerateVoiceModelFlag()

  return { ...profile, touchMode }
}

export function deleteVoiceSample(folderId: string): {
  ok: boolean
  wasActive: boolean
  touchMode: TouchFeedbackMode
} {
  const normalizedId = folderId.trim()
  if (!normalizedId || normalizedId === OFFICIAL_SAMPLE_ID) {
    throw new Error('无法删除官方默认配置')
  }

  const target = listVoiceSamples().find((item) => item.folderId === normalizedId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (target.kind === 'official') {
    throw new Error('无法删除官方默认配置')
  }

  const sampleDir = sampleDirForId(normalizedId)
  if (!existsSync(sampleDir)) {
    throw new Error('该音色目录不存在或已被删除')
  }

  const config = readVoiceForgeConfig()
  const wasActive = config.activeSample?.folderId === normalizedId

  rmSync(sampleDir, { recursive: true, force: true })

  clearVoiceForgeSession()
  clearRegenerateVoiceModelFlag()

  if (wasActive) {
    const { corpus } = readTouchConfig()
    const instruct = config.instruct
    writeVoiceForgeConfig(
      'curated',
      corpus,
      instruct,
      {
        folderId: OFFICIAL_SAMPLE_ID,
        displayName: OFFICIAL_SAMPLE_LABEL,
        kind: 'official',
        pending: false
      },
      { officialUseCuratedClips: true }
    )
    return { ok: true, wasActive: true, touchMode: 'curated' }
  }

  return { ok: true, wasActive: false, touchMode: config.mode }
}

export { readSampleCorpus }
