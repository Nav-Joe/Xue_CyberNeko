import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { resolveAppIconPath } from '../appIcon'

describe('resolveAppIconPath', () => {
  it('finds the transparent PNG next to splash assets', () => {
    const path = resolveAppIconPath()
    expect(path).toBeTruthy()
    expect(path?.replace(/\\/g, '/')).toMatch(/app-icon\.png$/)
    expect(existsSync(path!)).toBe(true)
  })
})
