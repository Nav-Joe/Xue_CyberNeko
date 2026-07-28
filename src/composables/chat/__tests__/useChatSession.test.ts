import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatSession } from '../useChatSession'
import { loadChatConfigView } from '../../../services/chat/chatConfigStore'
import { getActiveCharacterCard, loadCharacterCardsStore } from '../../../services/chat/characterCardStore'
import { llmChatWithRetry } from '../../../services/chat/llmChatRetry'
import { buildChatPromptMessages } from '../../../services/chat/promptBuilder'
import { createChatSegmentCoordinator } from '../../../services/chat/chatTtsPipeline'
import { appendMemoryRawLogInBackground, getRecentMemoryHistory, maybeMidSessionConsolidateInBackground, maybeRunPeriodRollup } from '../../../services/memory/memoryClient'
import { createDefaultChatConfigView } from '../../../services/chat/chatConfigDefaults'
import { OPENAI_API_MAX_HISTORY_ROUNDS } from '../../../services/chat/historyWindow'
import type { CharacterCard, CharacterCardsStore } from '../../../services/chat/types'

vi.mock('../../../services/chat/chatConfigStore')
vi.mock('../../../services/chat/characterCardStore')
vi.mock('../../../services/chat/llmChatRetry')
vi.mock('../../../services/chat/promptBuilder')
vi.mock('../../../services/chat/chatTtsPipeline')
vi.mock('../../../services/memory/memoryClient', () => ({
  appendMemoryRawLog: vi.fn().mockResolvedValue(true),
  appendMemoryRawLogInBackground: vi.fn(),
  getRecentMemoryHistory: vi.fn().mockResolvedValue(null),
  getMemoryPromptBlock: vi.fn().mockResolvedValue(''),
  consumePendingPeeksForUserTurn: vi.fn().mockResolvedValue(''),
  maybeRunPeriodRollup: vi.fn(),
  maybeMidSessionConsolidate: vi.fn().mockResolvedValue(undefined),
  maybeMidSessionConsolidateInBackground: vi.fn(),
  notifyMemoryChatClosed: vi.fn().mockResolvedValue(undefined)
}))

const sampleCard: CharacterCard = {
  id: 'default',
  name: '测试',
  rolePrompt: '你是猫娘',
  likes: '鱼',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const sampleStore: CharacterCardsStore = {
  activeCardId: 'default',
  cards: [sampleCard]
}

vi.mock('../../../services/ttsPlayer', () => ({
  stopSpeaking: vi.fn()
}))

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createChatSegmentCoordinator).mockImplementation((options) => ({
      pushDelta: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      revealFullText: vi.fn(async (text: string) => {
        options.onRevealSegment(text)
      }),
      reset: vi.fn()
    }))
    vi.mocked(loadChatConfigView).mockResolvedValue({
      ...createDefaultChatConfigView(),
      llmMode: 'openai_api'
    })
    vi.mocked(loadCharacterCardsStore).mockResolvedValue(sampleStore)
    vi.mocked(getActiveCharacterCard).mockReturnValue(sampleCard)
    vi.mocked(buildChatPromptMessages).mockResolvedValue([
      { role: 'system', content: '你是猫娘' },
      { role: 'user', content: '你好' }
    ])
    vi.mocked(llmChatWithRetry).mockResolvedValue({ content: '喵~' })
  })

  it('sendUserMessage appends user and assistant messages', async () => {
    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('你好')

    expect(session.messages.value).toHaveLength(2)
    expect(session.messages.value[0]?.role).toBe('user')
    expect(session.messages.value[0]?.content).toBe('你好')
    expect(session.messages.value[1]?.role).toBe('assistant')
    expect(session.messages.value[1]?.content).toBe('喵~')
    expect(session.error.value).toBe('')
  })

  it('send failure keeps user message and sets error', async () => {
    vi.mocked(llmChatWithRetry).mockRejectedValue(new Error('连接失败'))
    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('你好')

    expect(session.messages.value).toHaveLength(1)
    expect(session.messages.value[0]?.role).toBe('user')
    expect(session.error.value).toBe('连接失败')
  })

  it('clearSession resets messages and error', async () => {
    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('你好')
    session.clearSession()

    expect(session.messages.value).toHaveLength(0)
    expect(session.error.value).toBe('')
  })

  it('sendUserMessage keeps newest prior rounds for openai_api, not the oldest', async () => {
    vi.mocked(getRecentMemoryHistory).mockResolvedValue(null)
    const session = useChatSession()
    await session.initSession()

    for (let index = 0; index < OPENAI_API_MAX_HISTORY_ROUNDS + 5; index += 1) {
      session.messages.value.push(
        { id: `u${index}`, role: 'user', content: `turn-${index}`, status: 'done' },
        { id: `a${index}`, role: 'assistant', content: `reply-${index}`, status: 'done' }
      )
    }

    await session.sendUserMessage('latest-user-input')

    const call = vi.mocked(buildChatPromptMessages).mock.calls[0]?.[0]
    expect(call?.history).toHaveLength(OPENAI_API_MAX_HISTORY_ROUNDS * 2)
    expect(call?.history.some((message) => message.content === 'turn-0')).toBe(false)
    expect(call?.history.some((message) => message.content === 'turn-4')).toBe(false)
    expect(call?.history[0]?.content).toBe('turn-5')
    expect(call?.history.at(-2)?.content).toBe(`turn-${OPENAI_API_MAX_HISTORY_ROUNDS + 4}`)
    expect(call?.history.at(-1)?.content).toBe(`reply-${OPENAI_API_MAX_HISTORY_ROUNDS + 4}`)
    expect(call?.userInput).toBe('latest-user-input')
  })

  it('uses raw_logs recent history when memory is enabled', async () => {
    vi.mocked(loadChatConfigView).mockResolvedValue({
      ...createDefaultChatConfigView(),
      llmMode: 'local_llama',
      memoryEnabled: true,
      ttsEnabled: false
    })
    vi.mocked(getRecentMemoryHistory).mockResolvedValue([
      { role: 'user', content: '上次聊的' },
      { role: 'assistant', content: '记得呀' }
    ])

    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('新问题')

    expect(getRecentMemoryHistory).toHaveBeenCalledWith(10)
    const call = vi.mocked(buildChatPromptMessages).mock.calls[0]?.[0]
    expect(call?.history).toEqual([
      { role: 'user', content: '上次聊的' },
      { role: 'assistant', content: '记得呀' }
    ])
    expect(call?.userInput).toBe('新问题')
    expect(session.messages.value[0]?.content).toBe('新问题')
    expect(appendMemoryRawLogInBackground).toHaveBeenCalled()
    expect(maybeMidSessionConsolidateInBackground).toHaveBeenCalledWith(session.sessionId)
  })

  it('OPT-10: period rollup is sync F&F before prompt history await', async () => {
    vi.mocked(loadChatConfigView).mockResolvedValue({
      ...createDefaultChatConfigView(),
      llmMode: 'openai_api',
      memoryEnabled: true,
      ttsEnabled: false
    })
    let historyStarted = false
    let rollupBeforeHistory = false
    vi.mocked(maybeRunPeriodRollup).mockImplementation(() => {
      rollupBeforeHistory = !historyStarted
    })
    vi.mocked(getRecentMemoryHistory).mockImplementation(async () => {
      historyStarted = true
      await new Promise((resolve) => setTimeout(resolve, 15))
      return null
    })

    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('你好')

    expect(maybeRunPeriodRollup).toHaveBeenCalledOnce()
    expect(rollupBeforeHistory).toBe(true)
    expect(getRecentMemoryHistory).toHaveBeenCalled()
  })

  it('OPT-10 B: mid-session consolidate is F&F so sending clears without waiting', async () => {
    vi.mocked(loadChatConfigView).mockResolvedValue({
      ...createDefaultChatConfigView(),
      llmMode: 'openai_api',
      memoryEnabled: true,
      ttsEnabled: false
    })
    let consolidateStarted = false
    let resolveConsolidate!: () => void
    const consolidateGate = new Promise<void>((resolve) => {
      resolveConsolidate = resolve
    })
    vi.mocked(maybeMidSessionConsolidateInBackground).mockImplementation(() => {
      consolidateStarted = true
      void consolidateGate
    })

    const session = useChatSession()
    await session.initSession()
    await session.sendUserMessage('你好')

    expect(consolidateStarted).toBe(true)
    expect(maybeMidSessionConsolidateInBackground).toHaveBeenCalledWith(session.sessionId)
    expect(session.sending.value).toBe(false)
    expect(session.replyPending.value).toBe(false)

    resolveConsolidate()
  })

  it('replaces the stream coordinator while keeping reply pending through retry', async () => {
    vi.mocked(loadChatConfigView).mockResolvedValue({ ...createDefaultChatConfigView(), llmMode: 'local_llama', ttsEnabled: false })
    const coordinators: Array<ReturnType<typeof createChatSegmentCoordinator>> = []
    vi.mocked(createChatSegmentCoordinator).mockImplementation(() => {
      const coordinator = { pushDelta: vi.fn(), flush: vi.fn().mockResolvedValue(undefined), revealFullText: vi.fn().mockResolvedValue(undefined), reset: vi.fn() }
      coordinators.push(coordinator)
      return coordinator
    })
    const session = useChatSession()
    let pendingDuringRetry = false
    vi.mocked(llmChatWithRetry).mockImplementation(async (_config, _request, handlerFactory, hooks) => {
      handlerFactory?.(0)?.('partial')
      hooks?.onRetry?.(1, 3, new Error('OpenAI API 503: busy'))
      pendingDuringRetry = session.replyPending.value
      handlerFactory?.(1)?.('second')
      return { content: 'second' }
    })

    await session.initSession()
    await session.sendUserMessage('你好')

    expect(coordinators).toHaveLength(2)
    expect(coordinators[0]?.reset).toHaveBeenCalledOnce()
    expect(coordinators[0]?.pushDelta).toHaveBeenCalledWith('partial')
    expect(coordinators[1]?.pushDelta).toHaveBeenCalledWith('second')
    expect(coordinators[1]?.flush).toHaveBeenCalledOnce()
    expect(pendingDuringRetry).toBe(true)
    expect(session.replyPending.value).toBe(false)
  })
})
