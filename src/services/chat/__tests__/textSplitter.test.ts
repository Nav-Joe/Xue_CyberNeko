import { describe, expect, it } from 'vitest'
import {
  containsKaomoji,
  drainCompleteTtsSegments,
  splitTextForTts,
  stripEmojiForTts,
  stripKaomojiForTts,
  stripTextForTts
} from '../textSplitter'

describe('splitTextForTts', () => {
  it('splits on 。！？ and newline', () => {
    expect(splitTextForTts('你好呀。今天开心吗？嗯！')).toEqual(['你好呀。', '今天开心吗？', '嗯！'])
  })

  it('keeps incomplete tail as one segment', () => {
    expect(splitTextForTts('前半句。后半没标点')).toEqual(['前半句。', '后半没标点'])
  })

  it('does not split on comma', () => {
    expect(splitTextForTts('你好，世界。')).toEqual(['你好，世界。'])
  })

  it('drains complete segments from stream buffer', () => {
    const a = drainCompleteTtsSegments('', '第一句。第二')
    expect(a.segments).toEqual(['第一句。'])
    expect(a.rest).toBe('第二')
    const b = drainCompleteTtsSegments(a.rest, '句结束。')
    expect(b.segments).toEqual(['第二句结束。'])
    expect(b.rest).toBe('')
  })
})

describe('stripEmojiForTts', () => {
  it('removes emoji but keeps text and punctuation', () => {
    expect(stripEmojiForTts('你好😊呀。')).toBe('你好呀。')
    expect(stripEmojiForTts('🐱只有表情')).toBe('只有表情')
  })
})

describe('stripKaomojiForTts', () => {
  it('detects common kaomoji patterns', () => {
    expect(containsKaomoji('(´・ω・`)')).toBe(true)
    expect(containsKaomoji('^_^')).toBe(true)
    expect(containsKaomoji('QAQ')).toBe(true)
    expect(containsKaomoji('你好呀。')).toBe(false)
    expect(containsKaomoji('（比如这样）')).toBe(false)
  })

  it('removes bracketed and standalone kaomoji but keeps normal text', () => {
    expect(stripKaomojiForTts('好开心(´▽`)呀。')).toBe('好开心呀。')
    expect(stripKaomojiForTts('嗯嗯^_^')).toBe('嗯嗯')
    expect(stripKaomojiForTts('（比如这样）')).toBe('（比如这样）')
  })
})

describe('stripTextForTts', () => {
  it('removes emoji and kaomoji together for TTS', () => {
    expect(stripTextForTts('开心😊(´・ω・`)呀。')).toBe('开心呀。')
    expect(stripTextForTts('(´・ω・`)')).toBe('')
  })

  it('removes narrative parentheses for TTS but keeps spoken text', () => {
    expect(stripTextForTts('（轻轻点头）你好呀。')).toBe('你好呀。')
    expect(stripTextForTts('我在想（其实有点紧张）要不要说。')).toBe('我在想要不要说。')
    expect(stripTextForTts('(smiles) Hi.')).toBe('Hi.')
    expect(stripTextForTts('（外层（内心独白））说出口了。')).toBe('说出口了。')
  })

  it('removes ellipsis runs for TTS', () => {
    expect(stripTextForTts('然后...就这样。')).toBe('然后就这样。')
    expect(stripTextForTts('......')).toBe('')
    expect(stripTextForTts('嗯……好吧。')).toBe('嗯好吧。')
    expect(stripTextForTts('等一下......')).toBe('等一下')
  })
})
