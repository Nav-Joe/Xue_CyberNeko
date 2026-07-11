import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../../src/types/corpus'

import {
  CORPUS_SNAPSHOT_NAME,
  defaultCorpusFile,
  sampleDirForId
} from '../paths'

export function normalizeCorpusPayload(raw: unknown): CorpusData {
  const fallback = JSON.parse(readFileSync(defaultCorpusFile(), 'utf8')) as CorpusData
  if (!raw || typeof raw !== 'object') {
    return fallback
  }
  const parts: Array<keyof CorpusData> = ['head', 'arms', 'body', 'legs', 'tail']
  const result = {} as CorpusData
  for (const part of parts) {
    const value = (raw as Record<string, unknown>)[part]
    if (Array.isArray(value)) {
      result[part] = value
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter(Boolean)
    } else {
      result[part] = [...(fallback[part] ?? [])]
    }
  }
  return result
}

export function writeCorpusSnapshotForSample(sampleDir: string, corpus: CorpusData): void {
  mkdirSync(sampleDir, { recursive: true })
  writeFileSync(
    join(sampleDir, CORPUS_SNAPSHOT_NAME),
    `${JSON.stringify(corpus, null, 2)}\n`,
    'utf8'
  )
}

/** 读取某条声线目录下的语料快照；若无快照则返回内置默认语料。 */
export function readSampleCorpus(folderId: string): CorpusData {
  const sampleDir = sampleDirForId(folderId)
  const snapshotPath = join(sampleDir, CORPUS_SNAPSHOT_NAME)
  if (existsSync(snapshotPath)) {
    try {
      return normalizeCorpusPayload(JSON.parse(readFileSync(snapshotPath, 'utf8')))
    } catch {
      // fall through
    }
  }
  return normalizeCorpusPayload(JSON.parse(readFileSync(defaultCorpusFile(), 'utf8')))
}
