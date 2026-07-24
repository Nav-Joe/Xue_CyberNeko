import { describe, expect, it } from 'vitest'

import {
  LOCAL_LLAMA_MEMORY_BUDGET,
  OPENAI_MEMORY_BUDGET,
  memoryBudgetForMode
} from '../memoryBudgets'

describe('memoryBudgetForMode', () => {
  it('keeps OpenAI defaults unchanged', () => {
    const b = memoryBudgetForMode('openai_api')
    expect(b).toEqual(OPENAI_MEMORY_BUDGET)
    expect(b.corePoolMax).toBe(5)
    expect(b.coreMaxTokens).toBe(300)
    expect(b.summaryMaxTokens).toBe(1024)
  })

  it('tightens local llama budget', () => {
    const b = memoryBudgetForMode('local_llama')
    expect(b).toEqual(LOCAL_LLAMA_MEMORY_BUDGET)
    expect(b.corePoolMax).toBe(2)
    expect(b.coreMaxTokens).toBe(100)
    expect(b.coreMaxChars).toBe(150)
    expect(b.summaryMaxTokens).toBe(254)
  })

  it('defaults unknown/undefined to OpenAI profile', () => {
    expect(memoryBudgetForMode(undefined).profile).toBe('openai_api')
  })
})
