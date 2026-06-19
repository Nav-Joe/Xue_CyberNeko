import corpusData from '../data/corpus.json'
import type { BodyPart, CorpusData } from '../types/corpus'

const corpus = corpusData as CorpusData

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null
  }
  return items[Math.floor(Math.random() * items.length)] ?? null
}

/**
 * 按部位随机取一条语料；该部位为空时回退到 body（便于 M2 先跑通，其它部位留给以后填）。
 */
export function pickCorpusLine(part: BodyPart): { part: BodyPart; line: string; fallback: boolean } | null {
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
  return corpus
}
