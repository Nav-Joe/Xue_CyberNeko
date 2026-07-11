import { readConfiguredTtsEngine } from '../../ttsEngineInfo'
import {
  clearRegenerateVoiceModelFlag,
  markCorpusPrewarmPending,
  readRealtimeInferenceFlag,
  writeRealtimeInferenceFlag
} from '../internal/flags-io'
import { clearVoiceForgeSession } from '../internal/session-io'
import { sampleDirForId } from '../paths'
import {
  isOfficialSampleProfile,
  isOfficialTouchCacheReady,
  readVoiceForgeConfig,
  readVoiceForgeJson,
  resolveInstructForSample,
  writeVoiceForgeConfig
} from './voice-forge'
import { readSampleCorpus } from '../internal/corpus-utils'
import type { TouchFeedbackMode, VoiceSampleProfile } from '../types/runtime-config'
import { sampleHasReference } from '../internal/sample-utils'

export { readRealtimeInferenceFlag }

export function setOfficialTouchPlayback(useCuratedClips: boolean): {
  touchMode: TouchFeedbackMode
  officialUseCuratedClips: boolean
} {
  const config = readVoiceForgeConfig()
  if (!isOfficialSampleProfile(config.activeSample)) {
    throw new Error('仅在使用官方默认声线时可切换触摸音频来源')
  }

  if (!useCuratedClips && !isOfficialTouchCacheReady()) {
    throw new Error('官方语料预热缓存为空，请先在音色工坊「更新语料库」中选择「默认配置」并保存预热。')
  }

  const profile: VoiceSampleProfile = {
    folderId: config.activeSample!.folderId,
    displayName: config.activeSample!.displayName,
    kind: 'official',
    pending: false
  }
  const touchMode: TouchFeedbackMode = useCuratedClips ? 'curated' : 'custom_corpus'

  writeVoiceForgeConfig(touchMode, config.corpus, config.instruct, profile, {
    officialUseCuratedClips: useCuratedClips
  })

  if (useCuratedClips) {
    writeRealtimeInferenceFlag(false)
  }

  clearVoiceForgeSession()
  clearRegenerateVoiceModelFlag()

  return { touchMode, officialUseCuratedClips: useCuratedClips }
}

/** 开启/关闭触摸实时推理；开启时会切到语料 TTS 并加载当前激活声线的克隆引擎。 */
export function setRealtimeTouchInference(enabled: boolean): {
  enabled: boolean
  touchMode: TouchFeedbackMode
  officialUseCuratedClips: boolean
  activeSampleName: string | null
  activeSampleKind: 'official' | 'custom' | null
} {
  writeRealtimeInferenceFlag(enabled)

  const config = readVoiceForgeConfig()

  if (enabled && config.mode === 'alt_engine_corpus') {
    return {
      enabled: true,
      touchMode: 'alt_engine_corpus',
      officialUseCuratedClips: false,
      activeSampleName: `第三方引擎 (${readConfiguredTtsEngine()})`,
      activeSampleKind: null
    }
  }

  if (!enabled) {
    return {
      enabled: false,
      touchMode: config.mode,
      officialUseCuratedClips: config.officialUseCuratedClips,
      activeSampleName: config.activeSample?.displayName ?? null,
      activeSampleKind:
        config.activeSample?.kind ??
        (config.activeSample && isOfficialSampleProfile(config.activeSample) ? 'official' : 'custom') ??
        null
    }
  }

  const active = config.activeSample
  if (!active?.folderId?.trim()) {
    writeRealtimeInferenceFlag(false)
    throw new Error('请先在回家窗口选择要使用的声线')
  }

  const sampleDir = sampleDirForId(active.folderId)
  if (!sampleHasReference(sampleDir)) {
    writeRealtimeInferenceFlag(false)
    throw new Error('当前声线尚未就绪，无法启用实时推理')
  }

  const profile: VoiceSampleProfile = {
    folderId: active.folderId,
    displayName: active.displayName,
    kind: isOfficialSampleProfile(active) ? 'official' : 'custom',
    pending: false
  }
  const corpus = readSampleCorpus(active.folderId)
  const instruct = resolveInstructForSample(profile, readVoiceForgeJson())

  writeVoiceForgeConfig('custom_corpus', corpus, instruct, profile, {
    officialUseCuratedClips: false
  })
  markCorpusPrewarmPending(profile.folderId)
  clearVoiceForgeSession()

  return {
    enabled: true,
    touchMode: 'custom_corpus',
    officialUseCuratedClips: false,
    activeSampleName: active.displayName,
    activeSampleKind: profile.kind ?? 'custom'
  }
}
