import { describe, expect, it } from 'vitest'

import { splitTextForCompanionTts } from '../companionTextSplitter'

describe('splitTextForCompanionTts', () => {
  it('splits on comma and drops delimiter', () => {
    expect(splitTextForCompanionTts('我是雪澜，一只猫娘')).toEqual(['我是雪澜', '一只猫娘'])
  })

  it('splits on sentence end and pause punctuation', () => {
    expect(splitTextForCompanionTts('你好呀。今天开心吗？嗯！')).toEqual([
      '你好呀',
      '今天开心吗',
      '嗯'
    ])
  })

  it('splits on顿号 and semicolon', () => {
    expect(splitTextForCompanionTts('先看菜单、再进游戏；加油')).toEqual(['先看菜单', '再进游戏', '加油'])
  })
})
