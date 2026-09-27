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
  if (purpose === 'speak' && config.ttsBackend !== 'qwen') {
    return { ok: false, detail: '当前为本地 TTS 模式，请先切换到云端 TTS' }
  }

  const baseUrl = config.qwen.baseUrl.trim()
  if (!baseUrl) {
    return { ok: false, detail: '请填写百炼 baseUrl' }
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
    return { ok: false, detail: '请填写与当前音色对应的 Qwen TTS 模型名' }
  }

  return { ok: true }
}

/** 百炼 HTTP API 根：只保留主机（或 …/api/v1），剥掉具体业务 path。 */
export function normalizeQwenApiRoot(baseUrl: string): string {
  let root = baseUrl.trim().replace(/\/+$/, '')
  // 用户若把「克隆完整 URL」或「合成完整 URL」填进 baseUrl，剥回可复用的根
  root = root.replace(/\/api\/v1\/services\/audio\/tts\/customization$/i, '')
  root = root.replace(/\/api\/v1\/services\/aigc\/multimodal-generation\/generation$/i, '')
  root = root.replace(/\/+$/, '')
  return root
}

/** 声音复刻 enrollment（C2） */
export function buildQwenEnrollmentUrl(baseUrl: string): string {
  const root = normalizeQwenApiRoot(baseUrl)
  if (/\/api\/v1\/services\/audio\/tts\/customization$/i.test(root)) {
    return root
  }
  if (/\/api\/v1$/i.test(root)) {
    return `${root}/services/audio/tts/customization`
  }
  return `${root}/api/v1/services/audio/tts/customization`
}

/** 非实时多模态合成（C3） */
export function buildQwenMultimodalGenerationUrl(baseUrl: string): string {
  const root = normalizeQwenApiRoot(baseUrl)
  if (/\/api\/v1\/services\/aigc\/multimodal-generation\/generation$/i.test(root)) {
    return root
  }
  if (/\/api\/v1$/i.test(root)) {
    return `${root}/services/aigc/multimodal-generation/generation`
  }
  return `${root}/api/v1/services/aigc/multimodal-generation/generation`
}
