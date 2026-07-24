/**
 * 打分解析工具（M4.2）。
 * 关窗整理已改为单次 LLM（summary+significance+keywords 同 JSON）；
 * 本文件仅保留 clamp/parse，供单测与兼容旧调用。
 */

export type SummaryScorePayload = {
  significance: number
  keywords: string[]
}

export function clampSignificance(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(10, Math.max(0, Math.round(value * 10) / 10))
}

export function parseSummaryScoreContent(content: string): SummaryScorePayload {
  const trimmed = content.trim()
  let raw: {
    significance?: unknown
    score?: unknown
    keywords?: unknown
  }
  try {
    raw = JSON.parse(trimmed) as typeof raw
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('LLM 未返回 JSON')
    raw = JSON.parse(trimmed.slice(start, end + 1)) as typeof raw
  }
  const num =
    typeof raw.significance === 'number'
      ? raw.significance
      : typeof raw.score === 'number'
        ? raw.score
        : Number(raw.significance ?? raw.score)
  const significance = clampSignificance(num)
  const keywordsRaw = Array.isArray(raw.keywords) ? raw.keywords : []
  const keywords = keywordsRaw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 24))
    .slice(0, 5)
  return { significance, keywords }
}
