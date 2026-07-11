import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { CorpusData } from '../../../../src/types/corpus'

import { normalizeCorpusPayload } from '../internal/corpus-utils'
import {
  altEngineCacheRoot,
  CORPUS_SNAPSHOT_NAME,
  customCorpusFile,
  defaultCorpusFile,
  runtimeDir,
  touchModeFile
} from '../paths'
import type { TouchConfigView, TouchFeedbackMode } from '../types/runtime-config'

export function normalizeTouchMode(raw: string | undefined): TouchFeedbackMode {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === 'alt_engine_corpus' || value === 'alt_engine' || value === 'alt-corpus') {
    return 'alt_engine_corpus'
  }
  if (value === 'custom_corpus' || value === 'custom' || value === 'corpus') {
    return 'custom_corpus'
  }
  return 'curated'
}

export function readTouchConfig(): TouchConfigView {
  let mode: TouchFeedbackMode = 'curated'
  const modePath = touchModeFile()
  if (existsSync(modePath)) {
    mode = normalizeTouchMode(readFileSync(modePath, 'utf8').split('\n')[0])
  }

  const corpusPath = existsSync(customCorpusFile()) ? customCorpusFile() : defaultCorpusFile()
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusData
  return { mode, corpus }
}

export function writeTouchConfig(mode: TouchFeedbackMode, corpus: CorpusData): void {
  mkdirSync(runtimeDir(), { recursive: true })
  writeFileSync(touchModeFile(), `${mode}\n`, 'utf8')
  writeFileSync(customCorpusFile(), `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
}

/** 读取第三方引擎语料快照（other_custom_cache/{engine}/corpus.snapshot.json）。 */
export function readAltEngineCorpus(engine?: string): CorpusData {
  const snapshotPath = join(altEngineCacheRoot(engine), CORPUS_SNAPSHOT_NAME)
  if (existsSync(snapshotPath)) {
    try {
      return normalizeCorpusPayload(JSON.parse(readFileSync(snapshotPath, 'utf8')))
    } catch {
      // fall through
    }
  }
  return readTouchConfig().corpus
}
