import { isSafeCloudLocalVoiceId } from './cloudCachePaths'
import {
  DEFAULT_SEED_BASE_URL,
  DEFAULT_SEED_RESOURCE_ID,
  type SeedCloudFields,
  type SeedVoice
} from './types'

export function defaultSeedFields(): SeedCloudFields {
  return {
    baseUrl: DEFAULT_SEED_BASE_URL,
    resourceId: DEFAULT_SEED_RESOURCE_ID,
    voices: [],
    activeVoiceLocalId: '',
    apiKey: '',
    secretSave: false
  }
}

export function normalizeSeedVoices(raw: unknown): SeedVoice[] {
  if (!Array.isArray(raw)) return []
  const out: SeedVoice[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const speaker = typeof row.speaker === 'string' ? row.speaker.trim() : ''
    if (!id || !speaker || !isSafeCloudLocalVoiceId(id)) continue
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : speaker
    const createdAt =
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : Date.now()
    out.push({ id, name, speaker, createdAt })
  }
  return out
}

export function normalizeSeedFields(
  raw: {
    baseUrl?: string
    resourceId?: string
    voices?: unknown
    activeVoiceLocalId?: string
    secretSave?: boolean
  } | undefined,
  apiKey: string
): SeedCloudFields {
  const voices = normalizeSeedVoices(raw?.voices)
  let activeVoiceLocalId =
    typeof raw?.activeVoiceLocalId === 'string' ? raw.activeVoiceLocalId.trim() : ''
  if (activeVoiceLocalId && !voices.some((voice) => voice.id === activeVoiceLocalId)) {
    activeVoiceLocalId = ''
  }
  if (!activeVoiceLocalId && voices.length > 0) {
    activeVoiceLocalId = voices[0].id
  }
  return {
    baseUrl: raw?.baseUrl?.trim() || DEFAULT_SEED_BASE_URL,
    resourceId: raw?.resourceId?.trim() || DEFAULT_SEED_RESOURCE_ID,
    voices,
    activeVoiceLocalId,
    apiKey,
    secretSave: raw?.secretSave === true
  }
}
