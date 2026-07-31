import { describe, expect, it } from 'vitest'

import { createRelationshipTurnBuffer, REL_EVAL_EVERY_N } from '../turnBuffer'

describe('relationship turn buffer', () => {
  it('flushes every N rounds and leaves remainder', () => {
    const buf = createRelationshipTurnBuffer(3)
    expect(buf.push({ userText: 'u1', assistantText: 'a1' })).toBeNull()
    expect(buf.push({ userText: 'u2', assistantText: 'a2' })).toBeNull()
    const batch = buf.push({ userText: 'u3', assistantText: 'a3' })
    expect(batch).toHaveLength(REL_EVAL_EVERY_N)
    expect(batch?.[0].assistantText).toBe('a1')
    expect(buf.size()).toBe(0)

    buf.push({ userText: 'u4', assistantText: 'a4' })
    expect(buf.size()).toBe(1)
    const rest = buf.flush()
    expect(rest).toEqual([{ userText: 'u4', assistantText: 'a4' }])
    expect(buf.flush()).toBeNull()
  })

  it('skips empty assistant and ignores blank-only push', () => {
    const buf = createRelationshipTurnBuffer(2)
    expect(buf.push({ userText: 'u', assistantText: '  ' })).toBeNull()
    expect(buf.size()).toBe(0)
    expect(buf.push({ userText: 'u1', assistantText: 'a1' })).toBeNull()
    const batch = buf.push({ userText: 'u2', assistantText: 'a2' })
    expect(batch).toHaveLength(2)
  })
})
