import { describe, expect, it } from 'vitest'

import { buildCompanionMemoryTranscript } from '../../memory/summarizeCompanionLlm'

describe('buildCompanionMemoryTranscript', () => {
  it('formats narrate and observe lines with game name', () => {
    const text = buildCompanionMemoryTranscript('DemoGame', [
      { ts: Date.UTC(2026, 7, 23, 12, 0), kind: 'observe', gameName: 'DemoGame', text: '主菜单' },
      { ts: Date.UTC(2026, 7, 23, 12, 1), kind: 'narrate', gameName: 'DemoGame', text: '挺有味道' }
    ])
    expect(text).toContain('屏幕摘要')
    expect(text).toContain('旁白')
    expect(text).toContain('DemoGame')
    expect(text).toContain('主菜单')
    expect(text).toContain('挺有味道')
  })
})
