export type MemoryTimelineItem =
  | {
      kind: 'summary'
      id: string
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      source?: 'chat' | 'companion'
      sourceLabel?: string | null
      startedAt: number
      endedAt: number | null
      messageCount: number
    }
  | {
      kind: 'period'
      id: string
      periodKind: 'weekly' | 'monthly'
      summary: string
      keyFacts: string[]
      emotionTags: string[]
      significance: number
      keywords: string[]
      periodStart: number
      periodEnd: number
    }
  | {
      kind: 'core'
      id: string
      category: string
      content: string
      /** 活力系数 */
      weight: number
      fixed: boolean
      updatedAt: number
    }
