import { describe, expect, it, vi } from 'vitest'

vi.mock('../../memory/flags', () => ({
  readMemoryFlags: vi.fn(() => ({
    memoryEnabled: true,
    memoryConsolidateOnChatClose: true,
    memoryLlmSummarizeEnabled: true,
    memoryEmotionScoreEnabled: true
  }))
}))

vi.mock('../../memory/consolidate', () => ({
  runOnConsolidateChain: vi.fn(() => new Promise(() => {}))
}))

describe('scheduleCompanionMemoryConsolidate fire-and-forget', () => {
  it('returns immediately without awaiting the consolidate chain', async () => {
    const { runOnConsolidateChain } = await import('../../memory/consolidate')
    const { scheduleCompanionMemoryConsolidate } = await import('../companionMemoryConsolidate')

    const started = Date.now()
    scheduleCompanionMemoryConsolidate({
      companionSessionId: 'companion-ff',
      gameName: 'DemoGame',
      startedAtMs: 1,
      endedAtMs: 2
    })
    const elapsedMs = Date.now() - started

    expect(elapsedMs).toBeLessThan(50)
    expect(runOnConsolidateChain).toHaveBeenCalledOnce()
  })
})
