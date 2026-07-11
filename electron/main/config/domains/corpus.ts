import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../../src/types/corpus'

import { readConfiguredTtsEngine } from '../../ttsEngineInfo'
import { writeCorpusSnapshotForSample } from '../internal/corpus-utils'
import {
  clearRegenerateVoiceModelFlag,
  markCorpusPrewarmPending,
  writeRealtimeInferenceFlag
} from '../internal/flags-io'
import { clearVoiceForgeSession } from '../internal/session-io'
import { writeSampleInstruct } from '../internal/sample-utils'
import {
  ALT_ENGINE_PREWARM_TARGET,
  CORPUS_SNAPSHOT_NAME,
  customCorpusFile,
  sampleDirForId,
  touchModeFile,
  voiceForgeRoot
} from '../paths'
import { readTouchConfig, writeTouchConfig } from './touch'
import {
  isOfficialSampleProfile,
  preserveCustomInstructFromConfig,
  readDefaultInstruct,
  readVoiceForgeJson,
  resolveInstructForSample,
  writeVoiceForgeConfig
} from './voice-forge'
import { listVoiceSamples } from './voice-samples'
import type { CorpusPrewarmResult, VoiceSampleProfile } from '../types/runtime-config'
import { OFFICIAL_SAMPLE_ID, OFFICIAL_SAMPLE_LABEL } from '../types/runtime-config'

/** 保存语料并预热；若目标不是当前激活声线，则不切换运行时配置。 */
export function applyCorpusPrewarm(folderId: string, corpus: CorpusData): CorpusPrewarmResult {
  const target = listVoiceSamples().find((item) => item.folderId === folderId)
  if (!target) {
    throw new Error('未找到该音色样本')
  }
  if (!target.hasReference) {
    throw new Error('该音色尚未生成参考音频，请先在音色工坊完成创建')
  }

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
    kind:
      target.folderId === OFFICIAL_SAMPLE_ID || target.kind === 'official' ? 'official' : 'custom',
    pending: false
  }
  const instruct = resolveInstructForSample(profile, config)
  const isActiveTarget = previousActive?.folderId === profile.folderId
  const currentTouchMode = readTouchConfig().mode

  const sampleDir = sampleDirForId(target.folderId)
  writeCorpusSnapshotForSample(sampleDir, corpus)

  if (isOfficialSampleProfile(profile)) {
    preserveCustomInstructFromConfig(previousActive, config)
  } else {
    writeSampleInstruct(sampleDir, instruct)
  }

  if (isActiveTarget) {
    writeVoiceForgeConfig('custom_corpus', corpus, instruct, profile, {
      officialUseCuratedClips: false
    })
  }

  markCorpusPrewarmPending(profile.folderId)
  clearVoiceForgeSession()
  clearRegenerateVoiceModelFlag()

  return {
    ...profile,
    runtimeUnchanged: !isActiveTarget,
    touchMode: isActiveTarget ? 'custom_corpus' : currentTouchMode
  }
}

/** 非 Qwen 引擎：保存语料并预热到 voice_forge/other_custom_cache/{engine}/ */
export function applyAltEngineCorpus(corpus: CorpusData): {
  ok: true
  mode: 'alt_engine_corpus'
  engine: string
} {
  const engine = readConfiguredTtsEngine()
  if (engine === 'qwen') {
    throw new Error('Qwen 引擎请使用音色工坊管理语料')
  }

  const cacheRoot = join(voiceForgeRoot(), 'other_custom_cache', engine)
  mkdirSync(cacheRoot, { recursive: true })
  writeFileSync(join(cacheRoot, CORPUS_SNAPSHOT_NAME), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
  writeFileSync(customCorpusFile(), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
  writeFileSync(touchModeFile(), 'alt_engine_corpus\n', 'utf8')

  writeVoiceForgeConfig(
    'alt_engine_corpus',
    corpus,
    readDefaultInstruct(),
    {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    },
    { officialUseCuratedClips: false }
  )

  markCorpusPrewarmPending(ALT_ENGINE_PREWARM_TARGET)
  return { ok: true, mode: 'alt_engine_corpus', engine }
}

export function disableAltEngineCorpus(): { touchMode: 'curated' } {
  const { corpus } = readTouchConfig()
  writeTouchConfig('curated', corpus)
  writeVoiceForgeConfig(
    'curated',
    corpus,
    readDefaultInstruct(),
    {
      folderId: OFFICIAL_SAMPLE_ID,
      displayName: OFFICIAL_SAMPLE_LABEL,
      kind: 'official',
      pending: false
    },
    { officialUseCuratedClips: true }
  )
  writeRealtimeInferenceFlag(false)
  return { touchMode: 'curated' }
}
