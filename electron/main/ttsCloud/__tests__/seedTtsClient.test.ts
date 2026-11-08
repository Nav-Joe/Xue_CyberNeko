import { describe, expect, it } from 'vitest'

import { collectSeedAudioChunks } from '../seedTtsClient'

describe('seed tts chunks', () => {
  it('joins base64 audio chunks and ignores a trailing empty line', () => {
    const first = Buffer.from([1, 2]).toString('base64')
    const second = Buffer.from([3]).toString('base64')
    const body = [
      JSON.stringify({ code: 0, message: 'OK', data: first }),
      JSON.stringify({ code: 0, message: 'OK', data: second }),
      JSON.stringify({ code: 20000000, message: 'OK', data: null })
    ].join('\n')

    const collected = collectSeedAudioChunks(body)
    expect('audio' in collected).toBe(true)
    if ('audio' in collected) {
      expect(Array.from(collected.audio[0])).toEqual([1, 2])
      expect(Array.from(collected.audio[1])).toEqual([3])
    }
  })

  it('returns the service message when no audio arrives', () => {
    const collected = collectSeedAudioChunks(JSON.stringify({ code: 45000000, message: 'speaker 无效', data: '' }))
    expect(collected).toEqual({ detail: 'speaker 无效' })
  })
})
