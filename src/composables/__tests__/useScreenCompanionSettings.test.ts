import { describe, expect, it, vi, beforeEach } from 'vitest'
import { clampIntervalSecUi } from '../../services/screenCompanion/screenCompanionStore'

describe('useScreenCompanionSettings interval save', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('clampIntervalSecUi preserves preset values used by chips', () => {
    expect(clampIntervalSecUi(30)).toBe(30)
    expect(clampIntervalSecUi(120)).toBe(120)
  })

  it('explicit interval passed to save should not fall back to 90', () => {
    const explicit = 30
    const draft = 90
    const sec = clampIntervalSecUi(explicit ?? draft)
    expect(sec).toBe(30)
  })
})
