import { isSafeCloudLocalVoiceId } from './cloudCachePaths'
import {
  DEFAULT_EDGE_VOICES,
  DEFAULT_EDGE_WSS_URL,
  type EdgeCloudFields,
  type EdgeVoice
} from './types'

export function defaultEdgeFields(): EdgeCloudFields {
  return {
    baseUrl: DEFAULT_EDGE_WSS_URL,
    voices: DEFAULT_EDGE_VOICES.map((voice) => ({ ...voice })),
    activeVoiceLocalId: DEFAULT_EDGE_VOICES[0]?.id ?? ''
  }
}

export function normalizeEdgeVoices(raw: unknown): EdgeVoice[] {
  if (!Array.isArray(raw)) return []
  const out: EdgeVoice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const speaker = typeof row.speaker === 'string' ? row.speaker.trim() : ''
    if (!id || !speaker || !isSafeCloudLocalVoiceId(id)) continue
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : speaker
    const createdAt =
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : 0
    out.push({ id, name, speaker, createdAt })
  }
  return out
}

export function normalizeEdgeFields(raw: {
  baseUrl?: string
  voices?: unknown
  activeVoiceLocalId?: string
} | undefined): EdgeCloudFields {
  const voices = normalizeEdgeVoices(raw?.voices)
  const list = voices.length > 0 ? voices : DEFAULT_EDGE_VOICES.map((voice) => ({ ...voice }))
  let activeVoiceLocalId =
    typeof raw?.activeVoiceLocalId === 'string' ? raw.activeVoiceLocalId.trim() : ''
  if (!list.some((voice) => voice.id === activeVoiceLocalId)) {
    activeVoiceLocalId = list[0]?.id ?? ''
  }
  return {
    baseUrl: raw?.baseUrl?.trim() || DEFAULT_EDGE_WSS_URL,
    voices: list,
    activeVoiceLocalId
  }
}
