import { createHash } from 'crypto'

import type { CorpusData } from '../../../src/types/corpus'

const PARTS: Array<keyof CorpusData> = ['head', 'arms', 'body', 'legs', 'tail']

/** 与本地 audio_cache_policy 对齐：sha256(text.strip())[:16] */
export function cloudTextKey(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex').slice(0, 16)
}

export function collectCorpusLines(corpus: CorpusData): string[] {
  const lines = new Set<string>()
  for (const part of PARTS) {
    for (const line of corpus[part] ?? []) {
      const t = typeof line === 'string' ? line.trim() : ''
      if (t) lines.add(t)
    }
  }
  return [...lines].sort()
}

export function hashCorpusBytes(corpusJson: string): string {
  return createHash('sha256').update(corpusJson, 'utf8').digest('hex').slice(0, 16)
}

/** 云引擎指纹：音色 id + kind + 合成 model */
export function hashCloudEngineIdentity(parts: {
  bailianVoiceId: string
  kind: string
  model: string
}): string {
  const raw = `${parts.kind}|${parts.bailianVoiceId}|${parts.model}`
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 24)
}

export function hashCloudSource(engineHash: string, corpusJson: string): string {
  return createHash('sha256')
    .update(engineHash, 'utf8')
    .update(corpusJson, 'utf8')
    .digest('hex')
    .slice(0, 24)
}
