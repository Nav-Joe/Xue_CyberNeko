import { describe, expect, it } from 'vitest'

import { generateSecMsGecV2 } from '../edgeToken'

describe('edge sec-ms-gec v2', () => {
  it('matches a token captured from Edge for a fixed 5-minute window', () => {
    expect(generateSecMsGecV2(1791888000)).toBe(
      '492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876'
    )
  })
})
