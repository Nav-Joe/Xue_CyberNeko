import defaultCorpus from '../data/corpus.json'
import type { BodyPart, CorpusData } from '../types/corpus'

let runtimeCorpus: CorpusData | null = null

const corpusFallback = defaultCorpus as CorpusData

function activeCorpus(): CorpusData {
  return runtimeCorpus ?? corpusFallback
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null
  }
  return items[Math.floor(Math.random() * items.length)] ?? null
}

export function setRuntimeCorpus(data: CorpusData | null): void {
  runtimeCorpus = data
}

/**
 * 按部位随机取一条语料；该部位为空时回退到 body。
 */
export function pickCorpusLine(part: BodyPart): { part: BodyPart; line: string; fallback: boolean } | null {
  const corpus = activeCorpus()
  const direct = pickRandom(corpus[part])
  if (direct) {
    return { part, line: direct, fallback: false }
  }

  if (part !== 'body') {
    const fallbackLine = pickRandom(corpus.body)
    if (fallbackLine) {
      return { part: 'body', line: fallbackLine, fallback: true }
    }
  }

  return null
}

export function getCorpusSnapshot(): CorpusData {
  return structuredClone(activeCorpus())
}

export function getDefaultCorpusSnapshot(): CorpusData {
  return structuredClone(corpusFallback)
}

/** 语料库中所有不重复句子（供缓存校验等） */
export function getAllCorpusLines(): string[] {
  const lines = new Set<string>()
  const corpus = activeCorpus()
  for (const part of Object.keys(corpus) as BodyPart[]) {
    for (const line of corpus[part]) {
      if (line.trim()) {
        lines.add(line.trim())
      }
    }
  }
  return [...lines].sort()
}

export function validateCorpusData(raw: unknown): { ok: true; data: CorpusData } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '语料必须是 JSON 对象' }
  }

  const parts: BodyPart[] = ['head', 'arms', 'body', 'legs', 'tail']
  const data = raw as Record<string, unknown>
  const result = {} as CorpusData

  for (const part of parts) {
    const value = data[part]
    if (value === undefined) {
      result[part] = []
      continue
    }
    if (!Array.isArray(value) || !value.every((line) => typeof line === 'string')) {
      return { ok: false, error: `${part} 必须是字符串数组` }
    }
    result[part] = value.map((line) => line.trim()).filter(Boolean)
  }

  return { ok: true, data: result }
}
