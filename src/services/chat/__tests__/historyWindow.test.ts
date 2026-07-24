import { describe, expect, it } from 'vitest'

import {
  LOCAL_LLAMA_MAX_HISTORY_ROUNDS,
  LOCAL_LLAMA_SOFT_MAX_HISTORY_ROUNDS,
  OPENAI_API_MAX_HISTORY_ROUNDS,
  OPENAI_API_SOFT_MAX_HISTORY_ROUNDS,
  formatHistoryWindowHint,
  maxHistoryRoundsForMode,
  softKeepHistoryRoundsForMode,
  softMaxHistoryRoundsForMode,
  splitHistoryIntoRounds,
  trimHistoryToRounds
} from '../historyWindow'
import type { ChatHistoryMessage } from '../types'

function round(user: string, assistant: string): ChatHistoryMessage[] {
  return [
    { role: 'user', content: user },
    { role: 'assistant', content: assistant }
  ]
}

describe('historyWindow', () => {
  it('maps llm mode to round limits', () => {
    expect(maxHistoryRoundsForMode('local_llama')).toBe(LOCAL_LLAMA_MAX_HISTORY_ROUNDS)
    expect(maxHistoryRoundsForMode('openai_api')).toBe(OPENAI_API_MAX_HISTORY_ROUNDS)
  })

  it('maps soft max / keep for mid-session consolidate', () => {
    expect(softMaxHistoryRoundsForMode('local_llama')).toBe(LOCAL_LLAMA_SOFT_MAX_HISTORY_ROUNDS)
    expect(softMaxHistoryRoundsForMode('openai_api')).toBe(OPENAI_API_SOFT_MAX_HISTORY_ROUNDS)
    expect(softKeepHistoryRoundsForMode('local_llama')).toBe(LOCAL_LLAMA_MAX_HISTORY_ROUNDS)
    expect(softKeepHistoryRoundsForMode('openai_api')).toBe(OPENAI_API_MAX_HISTORY_ROUNDS)
  })

  it('formats ui hint per llm mode', () => {
    expect(formatHistoryWindowHint('local_llama')).toContain('10 轮')
    expect(formatHistoryWindowHint('openai_api')).toContain('30 轮')
  })

  it('splits user-assistant pairs into rounds', () => {
    const history = [...round('u1', 'a1'), ...round('u2', 'a2')]
    expect(splitHistoryIntoRounds(history)).toEqual([
      [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' }
      ],
      [
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a2' }
      ]
    ])
  })

  it('drops leading orphan assistant messages', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'assistant', content: 'orphan' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' }
    ]
    expect(splitHistoryIntoRounds(history)).toEqual([
      [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' }
      ]
    ])
  })

  it('keeps trailing user-only round (incomplete turn)', () => {
    const history: ChatHistoryMessage[] = [
      ...round('u1', 'a1'),
      { role: 'user', content: 'u2' }
    ]
    expect(splitHistoryIntoRounds(history)).toEqual([
      [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' }
      ],
      [{ role: 'user', content: 'u2' }]
    ])
  })

  it('drops oldest rounds and keeps the newest ones (not vice versa)', () => {
    const history = [
      ...round('OLD-first', 'OLD-reply-first'),
      ...round('OLD-second', 'OLD-reply-second'),
      ...round('NEW-first', 'NEW-reply-first'),
      ...round('NEW-second', 'NEW-reply-second')
    ]

    const trimmed = trimHistoryToRounds(history, 2)

    expect(trimmed).toEqual([
      { role: 'user', content: 'NEW-first' },
      { role: 'assistant', content: 'NEW-reply-first' },
      { role: 'user', content: 'NEW-second' },
      { role: 'assistant', content: 'NEW-reply-second' }
    ])
    expect(trimmed.some((message) => message.content.startsWith('OLD'))).toBe(false)
    expect(trimmed.at(-1)?.content).toBe('NEW-reply-second')
  })

  it('preserves chronological order within kept rounds (oldest-kept before newest-kept)', () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      round(`turn-${index}`, `reply-${index}`)
    ).flat()

    const trimmed = trimHistoryToRounds(history, 10)

    expect(trimmed.map((message) => message.content)).toEqual([
      'turn-2',
      'reply-2',
      'turn-3',
      'reply-3',
      'turn-4',
      'reply-4',
      'turn-5',
      'reply-5',
      'turn-6',
      'reply-6',
      'turn-7',
      'reply-7',
      'turn-8',
      'reply-8',
      'turn-9',
      'reply-9',
      'turn-10',
      'reply-10',
      'turn-11',
      'reply-11'
    ])
    expect(trimmed.some((message) => message.content === 'turn-0')).toBe(false)
    expect(trimmed.some((message) => message.content === 'turn-1')).toBe(false)
  })

  it('trims to the last N rounds for local llama budget', () => {
    const history = Array.from({ length: 15 }, (_, index) =>
      round(`u${index}`, `a${index}`)
    ).flat()

    const trimmed = trimHistoryToRounds(history, LOCAL_LLAMA_MAX_HISTORY_ROUNDS)
    expect(trimmed).toHaveLength(LOCAL_LLAMA_MAX_HISTORY_ROUNDS * 2)
    expect(trimmed[0]?.content).toBe('u5')
    expect(trimmed.at(-1)?.content).toBe('a14')
  })

  it('trims to the last 30 rounds for openai api', () => {
    const history = Array.from({ length: 35 }, (_, index) =>
      round(`u${index}`, `a${index}`)
    ).flat()

    const trimmed = trimHistoryToRounds(history, OPENAI_API_MAX_HISTORY_ROUNDS)
    expect(trimmed).toHaveLength(OPENAI_API_MAX_HISTORY_ROUNDS * 2)
    expect(trimmed[0]?.content).toBe('u5')
    expect(trimmed.at(-1)?.content).toBe('a34')
  })
})
