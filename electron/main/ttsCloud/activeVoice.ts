import {
  DEFAULT_QWEN_VC_MODEL,
  DEFAULT_QWEN_VD_MODEL,
  type QwenCloudVoice,
  type QwenVoiceKind,
  type TtsCloudConfig
} from './types'

export type ResolvedActiveQwenVoice = {
  localId: string
  kind: QwenVoiceKind
  name: string
  voiceId: string
  model: string
}

export function modelForKind(config: TtsCloudConfig, kind: QwenVoiceKind): string {
  if (kind === 'vd') {
    return config.qwen.vdModel.trim() || DEFAULT_QWEN_VD_MODEL
  }
  return config.qwen.vcModel.trim() || DEFAULT_QWEN_VC_MODEL
}

export function findVoiceByLocalId(
  config: TtsCloudConfig,
  localId: string
): QwenCloudVoice | undefined {
  const id = localId.trim()
  if (!id) return undefined
  return config.qwen.voices.find((v) => v.id === id)
}

/** 解析当前合成用的音色与对应 model；无有效 active 返回 null */
export function resolveActiveQwenVoice(config: TtsCloudConfig): ResolvedActiveQwenVoice | null {
  const active = findVoiceByLocalId(config, config.qwen.activeVoiceLocalId)
  if (!active) return null
  const voiceId = active.voiceId.trim()
  if (!voiceId) return null
  const kind: QwenVoiceKind = active.kind === 'vd' ? 'vd' : 'vc'
  return {
    localId: active.id,
    kind,
    name: active.name,
    voiceId,
    model: modelForKind(config, kind)
  }
}

let voiceSeq = 0

function nextVoiceLocalId(kind: QwenVoiceKind): string {
  voiceSeq += 1
  return `${kind}-${Date.now().toString(36)}-${voiceSeq}`
}

/** preferred_name：数字、字母、下划线，最长 16 */
export function sanitizePreferredName(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 16)
  if (cleaned) return cleaned
  const fb = fallback
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 16)
  return fb || 'xue_voice'
}

/**
 * 追加一条云音色并设为 active（创造 / 自定义克隆用；不合并同名）。
 */
export function addCloudVoice(
  config: TtsCloudConfig,
  opts: { kind: QwenVoiceKind; name: string; voiceId: string }
): QwenCloudVoice {
  const entry: QwenCloudVoice = {
    id: nextVoiceLocalId(opts.kind),
    kind: opts.kind,
    name: opts.name.trim() || (opts.kind === 'vd' ? '云端设计音色' : '云端克隆音色'),
    voiceId: opts.voiceId.trim(),
    createdAt: Date.now()
  }
  config.qwen.voices = [...config.qwen.voices, entry]
  config.qwen.activeVoiceLocalId = entry.id
  return entry
}

/** 按本地 id 删除；若删的是当前项则切到列表首项 */
export function removeCloudVoiceByLocalId(config: TtsCloudConfig, localId: string): boolean {
  const id = localId.trim()
  if (!id) return false
  const before = config.qwen.voices.length
  config.qwen.voices = config.qwen.voices.filter((v) => v.id !== id)
  if (config.qwen.voices.length === before) return false
  if (config.qwen.activeVoiceLocalId === id) {
    config.qwen.activeVoiceLocalId = config.qwen.voices[0]?.id ?? ''
  }
  return true
}

/**
 * 官方样本云克隆：写入/更新一条 VC 音色并设为 active。
 * 同名「官方样本」条目会就地更新 voiceId，避免列表膨胀。
 */
export function upsertOfficialVcVoice(
  config: TtsCloudConfig,
  bailianVoiceId: string,
  displayName = '官方样本云克隆'
): void {
  const voiceId = bailianVoiceId.trim()
  if (!voiceId) return

  const existing = config.qwen.voices.find(
    (v) => v.kind === 'vc' && (v.name === displayName || v.voiceId === voiceId)
  )
  if (existing) {
    existing.voiceId = voiceId
    existing.name = displayName
    existing.kind = 'vc'
    config.qwen.activeVoiceLocalId = existing.id
    return
  }

  const entry: QwenCloudVoice = {
    id: nextVoiceLocalId('vc'),
    kind: 'vc',
    name: displayName,
    voiceId,
    createdAt: Date.now()
  }
  config.qwen.voices = [...config.qwen.voices, entry]
  config.qwen.activeVoiceLocalId = entry.id
}

/** 测试与就绪构造：直接挂一条 active 音色 */
export function setActiveCloudVoiceForTests(
  config: TtsCloudConfig,
  opts: { voiceId: string; kind?: QwenVoiceKind; name?: string; localId?: string }
): void {
  const kind = opts.kind ?? 'vc'
  const id = opts.localId ?? `test-${kind}`
  config.qwen.voices = [
    {
      id,
      kind,
      name: opts.name ?? (kind === 'vd' ? '测试 VD' : '测试 VC'),
      voiceId: opts.voiceId.trim(),
      createdAt: Date.now()
    }
  ]
  config.qwen.activeVoiceLocalId = id
}
