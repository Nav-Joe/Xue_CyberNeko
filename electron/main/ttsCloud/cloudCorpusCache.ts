import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import type { CorpusData } from '../../../src/types/corpus'
import { normalizeCorpusPayload } from '../config/internal/corpus-utils'
import {
  getTtsCloudVoiceCacheDir,
  getTtsCloudVoiceCorpusPath,
  getTtsCloudVoiceManifestPath,
  getTtsCloudVoicePointerPath,
  getTtsCloudVoiceWavPath
} from './cloudCachePaths'
import {
  cloudTextKey,
  collectCorpusLines,
  hashCloudEngineIdentity,
  hashCloudSource,
  hashCorpusBytes
} from './cloudCorpusHash'

export type CloudCacheManifestEntry = {
  key: string
  line_hash: string
}

export type CloudCacheManifest = {
  backend: 'qwen-cloud'
  variant_count: 1
  engine_hash: string
  corpus_hash: string
  source_hash: string
  active_voice_local_id: string
  bailian_voice_id: string
  voice_kind: string
  model: string
  entries: Record<string, CloudCacheManifestEntry>
}

export type CloudCachePointer = {
  version: 1
  localVoiceId: string
  ready: boolean
  lineCount: number
  sourceHash: string
  updatedAt: string
}

export function readCloudVoiceCorpus(userDataPath: string, localVoiceId: string): CorpusData {
  const path = getTtsCloudVoiceCorpusPath(userDataPath, localVoiceId)
  if (!existsSync(path)) {
    return normalizeCorpusPayload(null)
  }
  try {
    return normalizeCorpusPayload(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return normalizeCorpusPayload(null)
  }
}

export function writeCloudVoiceCorpus(
  userDataPath: string,
  localVoiceId: string,
  corpus: CorpusData
): void {
  const dir = getTtsCloudVoiceCacheDir(userDataPath, localVoiceId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    getTtsCloudVoiceCorpusPath(userDataPath, localVoiceId),
    `${JSON.stringify(corpus, null, 2)}\n`,
    'utf8'
  )
}

export function readCloudCacheManifest(
  userDataPath: string,
  localVoiceId: string
): CloudCacheManifest | null {
  const path = getTtsCloudVoiceManifestPath(userDataPath, localVoiceId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CloudCacheManifest
  } catch {
    return null
  }
}

export function writeCloudCacheManifest(
  userDataPath: string,
  localVoiceId: string,
  manifest: CloudCacheManifest
): void {
  const path = getTtsCloudVoiceManifestPath(userDataPath, localVoiceId)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

export function writeCloudCachePointer(
  userDataPath: string,
  localVoiceId: string,
  pointer: CloudCachePointer
): void {
  writeFileSync(
    getTtsCloudVoicePointerPath(userDataPath, localVoiceId),
    `${JSON.stringify(pointer, null, 2)}\n`,
    'utf8'
  )
}

export function resolveCloudCacheWav(
  userDataPath: string,
  localVoiceId: string,
  text: string
): { ok: true; bytes: Buffer; mime: 'audio/wav' } | { ok: false } {
  const line = text.trim()
  if (!line || !localVoiceId.trim()) return { ok: false }

  const manifest = readCloudCacheManifest(userDataPath, localVoiceId)
  if (!manifest) return { ok: false }
  const entry = manifest.entries[line]
  if (!entry?.key) return { ok: false }

  const wavPath = getTtsCloudVoiceWavPath(userDataPath, localVoiceId, entry.key)
  if (!existsSync(wavPath)) return { ok: false }
  try {
    const bytes = readFileSync(wavPath)
    if (bytes.byteLength === 0) return { ok: false }
    return { ok: true, bytes, mime: 'audio/wav' }
  } catch {
    return { ok: false }
  }
}

export function removeCloudVoiceCacheDir(userDataPath: string, localVoiceId: string): void {
  const dir = getTtsCloudVoiceCacheDir(userDataPath, localVoiceId)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function buildCloudManifestSkeleton(opts: {
  localVoiceId: string
  bailianVoiceId: string
  kind: string
  model: string
  corpus: CorpusData
  existingEntries?: Record<string, CloudCacheManifestEntry>
}): { manifest: CloudCacheManifest; lines: string[] } {
  const corpusJson = `${JSON.stringify(opts.corpus, null, 2)}\n`
  const engineHash = hashCloudEngineIdentity({
    bailianVoiceId: opts.bailianVoiceId,
    kind: opts.kind,
    model: opts.model
  })
  const corpusHash = hashCorpusBytes(corpusJson)
  const sourceHash = hashCloudSource(engineHash, corpusJson)
  const lines = collectCorpusLines(opts.corpus)
  const entries: Record<string, CloudCacheManifestEntry> = {}
  for (const line of lines) {
    const key = cloudTextKey(line)
    const prev = opts.existingEntries?.[line]
    entries[line] = prev?.key === key ? prev : { key, line_hash: key }
  }
  return {
    lines,
    manifest: {
      backend: 'qwen-cloud',
      variant_count: 1,
      engine_hash: engineHash,
      corpus_hash: corpusHash,
      source_hash: sourceHash,
      active_voice_local_id: opts.localVoiceId,
      bailian_voice_id: opts.bailianVoiceId,
      voice_kind: opts.kind,
      model: opts.model,
      entries
    }
  }
}

export function listLinesNeedingCloudPrewarm(
  userDataPath: string,
  localVoiceId: string,
  manifest: CloudCacheManifest,
  lines: string[]
): string[] {
  const prev = readCloudCacheManifest(userDataPath, localVoiceId)
  const sourceChanged = !prev || prev.source_hash !== manifest.source_hash
  const missing: string[] = []
  for (const line of lines) {
    const key = manifest.entries[line]?.key ?? cloudTextKey(line)
    const wavPath = getTtsCloudVoiceWavPath(userDataPath, localVoiceId, key)
    if (sourceChanged || !existsSync(wavPath)) {
      missing.push(line)
    }
  }
  return missing
}

export function writeCloudCacheWav(
  userDataPath: string,
  localVoiceId: string,
  textKey: string,
  audio: ArrayBuffer
): void {
  const wavPath = getTtsCloudVoiceWavPath(userDataPath, localVoiceId, textKey)
  mkdirSync(dirname(wavPath), { recursive: true })
  writeFileSync(wavPath, Buffer.from(audio))
}
