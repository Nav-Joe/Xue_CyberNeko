import { describe, expect, it } from 'vitest'

import { computeDownloadPercent, formatByteSize, formatDownloadProgressText } from '../formatBytes'

describe('formatBytes', () => {
  it('formats megabytes', () => {
    expect(formatByteSize(15 * 1024 * 1024)).toBe('15.0 MB')
  })

  it('computes download percent', () => {
    expect(computeDownloadPercent(50, 200)).toBe(25)
    expect(computeDownloadPercent(200, 200)).toBe(100)
  })

  it('formats progress detail', () => {
    expect(formatDownloadProgressText(50 * 1024 * 1024, 200 * 1024 * 1024)).toContain('/')
  })
})
