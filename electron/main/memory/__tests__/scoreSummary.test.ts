import { describe, expect, it } from 'vitest'

import { clampSignificance, parseSummaryScoreContent } from '../scoreSummaryLlm'

describe('parseSummaryScoreContent', () => {
  it('parses significance and keywords', () => {
    const parsed = parseSummaryScoreContent(
      JSON.stringify({ significance: 9.7, keywords: ['深爱', '承诺', '名字'] })
    )
    expect(parsed.significance).toBe(9.7)
    expect(parsed.keywords).toEqual(['深爱', '承诺', '名字'])
  })

  it('clamps out-of-range scores', () => {
    expect(clampSignificance(12)).toBe(10)
    expect(clampSignificance(-1)).toBe(0)
    expect(parseSummaryScoreContent('{"significance":11,"keywords":["a"]}').significance).toBe(10)
  })

  it('limits keywords to 5', () => {
    const parsed = parseSummaryScoreContent(
      JSON.stringify({
        significance: 5,
        keywords: ['1', '2', '3', '4', '5', '6', '7']
      })
    )
    expect(parsed.keywords).toHaveLength(5)
  })
})
