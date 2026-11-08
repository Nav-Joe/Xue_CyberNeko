import { ALI_TTS_URL_DENIED, resolveAliTtsUrl } from './aliTtsUrl'
import { resolveActiveQwenVoice } from './activeVoice'
import { DEFAULT_QWEN_VC_MODEL, type TtsCloudConfig } from './types'

export type CloudTtsReadyOk = { ok: true }
export type CloudTtsReadyErr = { ok: false; detail: string }
export type CloudTtsReady = CloudTtsReadyOk | CloudTtsReadyErr

/**
 * 云端合成就绪校验。
 * - preview：凭证 + 当前音色 voiceId
 * - speak：额外要求 ttsBackend === 'qwen'
 */
export function checkCloudTtsReady(
  config: TtsCloudConfig,
  purpose: 'preview' | 'speak'
): CloudTtsReady {
  if (config.ttsBackend === 'seed') {
    if (!config.seed.apiKey.trim()) {
      return { ok: false, detail: '请先填写 Seed API Key' }
    }
    const voice = config.seed.voices.find((item) => item.id === config.seed.activeVoiceLocalId)
    if (!voice?.speaker.trim()) {
      return { ok: false, detail: '请先添加并选择一条 Seed 声线' }
    }
    if (!config.seed.baseUrl.trim()) {
      return { ok: false, detail: '请填写 Seed 接口地址' }
    }
    return { ok: true }
  }

  if (config.ttsBackend === 'edge') {
    const voice = config.edge.voices.find((item) => item.id === config.edge.activeVoiceLocalId)
    if (!voice?.speaker.trim()) {
      return { ok: false, detail: '请先选择一条 Edge 声线' }
    }
    return { ok: true }
  }

  if (purpose === 'speak' && config.ttsBackend !== 'qwen') {
    return { ok: false, detail: '当前为本地 TTS 模式，请先切换到云端 TTS' }
  }

  const baseUrl = config.qwen.baseUrl.trim()
  if (!baseUrl) {
    return { ok: false, detail: '请填写百炼 baseUrl' }
  }
  if (!resolveAliTtsUrl(baseUrl, 'synthesize')) {
    return { ok: false, detail: ALI_TTS_URL_DENIED }
  }

  if (!config.qwen.apiKey.trim()) {
    return { ok: false, detail: '请填写百炼 API Key' }
  }

  const active = resolveActiveQwenVoice(config)
  if (!active) {
    return {
      ok: false,
      detail: '尚未云端克隆音色：请在音色工坊用官方样本完成云克隆'
    }
  }

  const model = active.model.trim() || DEFAULT_QWEN_VC_MODEL
  if (!model) {
    return { ok: false, detail: '请填写当前音色要使用的阿里 TTS 模型名' }
  }

  return { ok: true }
}

/** 阿里 TTS API 根：主机、/api/v1，或误贴的完整业务 path 都会收成根。 */
export function normalizeQwenApiRoot(baseUrl: string): string {
  const synth = resolveAliTtsUrl(baseUrl, 'synthesize')
  const marker = '/api/v1/services/'
  const at = synth.toLowerCase().indexOf(marker)
  if (at < 0) return baseUrl.trim().replace(/\/+$/, '')
  return synth.slice(0, at).replace(/\/+$/, '')
}

/** 声音复刻。根地址上拼接复刻 path；若 baseUrl 已是复刻完整地址则原样使用。 */
export function buildQwenEnrollmentUrl(baseUrl: string): string {
  return resolveAliTtsUrl(baseUrl, 'enroll')
}

/** 合成。默认接 SpeechSynthesizer；旧的多模态生成地址会改写到这条路径。 */
export function buildAliSpeechSynthesizeUrl(baseUrl: string): string {
  return resolveAliTtsUrl(baseUrl, 'synthesize')
}
