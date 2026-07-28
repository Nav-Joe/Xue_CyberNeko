import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

import { loadChatConfigView } from '../../services/chat/chatConfigStore'
import {
  getActiveCharacterCard,
  loadCharacterCardsStore
} from '../../services/chat/characterCardStore'
import { createChatSegmentCoordinator } from '../../services/chat/chatTtsPipeline'
import { logChatSegmentDebug } from '../../services/chat/chatDebugLog'
import { LLM_CHAT_MAX_RETRIES, llmChatWithRetry } from '../../services/chat/llmChatRetry'
import { splitTextForTts } from '../../services/chat/textSplitter'
import {
  formatHistoryWindowHint,
  maxHistoryRoundsForMode,
  trimHistoryToRounds
} from '../../services/chat/historyWindow'
import { buildChatPromptMessages } from '../../services/chat/promptBuilder'
import { stopSpeaking } from '../../services/ttsPlayer'
import { appendMemoryRawLog, appendMemoryRawLogInBackground, consumePendingPeeksForUserTurn, getMemoryPromptBlock, getRecentMemoryHistory, maybeMidSessionConsolidateInBackground, maybeRunPeriodRollup, notifyMemoryChatClosed } from '../../services/memory/memoryClient'
import type {
  CharacterCard,
  ChatConfigView,
  ChatHistoryMessage,
  ChatUiMessage
} from '../../services/chat/types'

function createMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`
}

function toHistoryMessages(messages: ChatUiMessage[]): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = []

  for (const item of messages) {
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const content = item.content.trim()
    if (!content) continue

    const prev = history[history.length - 1]
    if (item.role === 'assistant' && prev?.role === 'assistant') {
      prev.content += item.content
    } else {
      history.push({ role: item.role, content: item.content })
    }
  }

  return history
}

export function useChatSession() {
  const sessionId = createSessionId()
  const messages = ref<ChatUiMessage[]>([])
  const sending = ref(false)
  /** LLM 回复进行中：聊天窗 Live2D 触摸发声互斥 */
  const replyPending = ref(false)
  /** 软错误重试中：1–3 表示「正在重新请求 n/3」 */
  const retryAttempt = ref(0)
  const error = ref('')
  const config = ref<ChatConfigView | null>(null)
  const activeCard = ref<CharacterCard | null>(null)
  const initializing = ref(false)

  const canSend = computed(
    () => Boolean(activeCard.value && config.value && !sending.value && !initializing.value)
  )

  const modeLabel = computed(() => {
    if (!config.value) return ''
    return config.value.llmMode === 'local_llama' ? '本地 llama' : 'OpenAI API'
  })

  const historyWindowHint = computed(() => {
    if (!config.value) return ''
    return formatHistoryWindowHint(config.value.llmMode)
  })

  const maxHistoryRounds = computed(() => {
    if (!config.value) return 0
    return maxHistoryRoundsForMode(config.value.llmMode)
  })

  async function initSession(): Promise<void> {
    initializing.value = true
    error.value = ''
    try {
      config.value = await loadChatConfigView()
      const store = await loadCharacterCardsStore()
      activeCard.value = getActiveCharacterCard(store)
      if (!activeCard.value) {
        error.value = '未找到可用角色卡'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载聊天会话失败'
    } finally {
      initializing.value = false
    }
  }

  async function reloadConfig(): Promise<void> {
    try {
      config.value = await loadChatConfigView()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '刷新配置失败'
    }
  }

  function clearSession(): void {
    stopSpeaking()
    replyPending.value = false
    retryAttempt.value = 0
    messages.value = []
    error.value = ''
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      void notifyMemoryChatClosed(sessionId)
      clearSession()
    })
  }

  async function sendUserMessage(rawText: string): Promise<void> {
    const text = rawText.trim()
    if (!text || sending.value) return
    if (!config.value) {
      error.value = '聊天配置未加载'
      return
    }
    if (!activeCard.value) {
      error.value = '请先选择或创建角色卡'
      return
    }

    stopSpeaking()
    sending.value = true
    replyPending.value = true
    retryAttempt.value = 0
    error.value = ''

    const ttsEnabled = config.value.ttsEnabled !== false
    const ttsParallelLanes =
      ttsEnabled && config.value.ttsParallelEnabled ? config.value.ttsParallelLanes : 0

    const maxRounds = maxHistoryRoundsForMode(config.value.llmMode)
    let priorHistory = trimHistoryToRounds(toHistoryMessages(messages.value), maxRounds)
    let memoryBlock = ''
    let llmUserInput = text
    if (config.value.memoryEnabled) {
      // ② 开局 F&F：禁止 await（OPT-10）；不堵首 token
      maybeRunPeriodRollup()
      // ① Prompt 必等：历史 / 注入块 / 偷看前缀（读路径，禁止夹带总结 LLM）
      const fromDb = await getRecentMemoryHistory(maxRounds)
      if (fromDb !== null) {
        priorHistory = fromDb
      }
      memoryBlock = await getMemoryPromptBlock(text)
      const peekPrefix = await consumePendingPeeksForUserTurn()
      if (peekPrefix) {
        llmUserInput = `${peekPrefix}\n${text}`
      }
    }
    const userMessage: ChatUiMessage = {
      id: createMessageId(),
      role: 'user',
      content: text,
      status: 'done'
    }
    messages.value.push(userMessage)
    if (config.value.memoryEnabled) {
      // ② 开局 F&F：user raw
      appendMemoryRawLogInBackground({ sessionId, role: 'user', content: text })
    }

    let typingPlaceholderId: string | null = createMessageId()
    messages.value.push({
      id: typingPlaceholderId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })

    const removeTypingPlaceholder = (): void => {
      if (!typingPlaceholderId) return
      messages.value = messages.value.filter((item) => item.id !== typingPlaceholderId)
      typingPlaceholderId = null
    }

    const restoreTypingPlaceholder = (): void => {
      removeTypingPlaceholder()
      typingPlaceholderId = createMessageId()
      messages.value.push({
        id: typingPlaceholderId,
        role: 'assistant',
        content: '',
        status: 'streaming'
      })
    }

    const rollbackAssistantTurn = (): void => {
      const userIndex = messages.value.findIndex((item) => item.id === userMessage.id)
      if (userIndex === -1) return
      messages.value = messages.value.slice(0, userIndex + 1)
      restoreTypingPlaceholder()
    }

    const revealAssistantSegment = (segment: string): void => {
      removeTypingPlaceholder()
      messages.value.push({
        id: createMessageId(),
        role: 'assistant',
        content: segment,
        status: 'done'
      })
    }

    let segments = createChatSegmentCoordinator({
      ttsEnabled,
      ttsParallelLanes,
      onRevealSegment: revealAssistantSegment
    })

    const replaceSegments = (): void => {
      segments.reset()
      rollbackAssistantTurn()
      segments = createChatSegmentCoordinator({
        ttsEnabled,
        ttsParallelLanes,
        onRevealSegment: revealAssistantSegment
      })
    }

    try {
      const promptMessages = await buildChatPromptMessages({
        card: activeCard.value,
        history: priorHistory,
        userInput: llmUserInput,
        memoryBlock: memoryBlock || undefined
      })
      const useStream = config.value.llmMode === 'local_llama'

      const result = await llmChatWithRetry(
        config.value,
        { messages: promptMessages, stream: useStream },
        useStream ? () => (delta) => segments.pushDelta(delta) : undefined,
        {
          onRetry: (attempt) => {
            retryAttempt.value = attempt
            replaceSegments()
          }
        }
      )

      retryAttempt.value = 0

      logChatSegmentDebug('LLM 完整回复', result.content)
      logChatSegmentDebug(
        '完整回复切分预览',
        splitTextForTts(result.content)
          .map((seg, index) => `[${index + 1}] ${seg}`)
          .join('\n') || '(无句段)'
      )

      if (useStream) {
        await segments.flush()
      } else {
        await segments.revealFullText(result.content)
      }
      removeTypingPlaceholder()
      if (config.value.memoryEnabled && result.content.trim()) {
        // ③ 轮后：assistant raw 须先落库；满轮总结 F&F（OPT-10 B），不拖 sending 复位
        await appendMemoryRawLog({
          sessionId,
          role: 'assistant',
          content: result.content.trim()
        })
        maybeMidSessionConsolidateInBackground(sessionId)
      }
    } catch (err) {
      retryAttempt.value = 0
      segments.reset()
      removeTypingPlaceholder()
      error.value = err instanceof Error ? err.message : '发送失败'
    } finally {
      replyPending.value = false
      sending.value = false
    }
  }

  return {
    messages,
    sending,
    replyPending,
    retryAttempt,
    retryMax: LLM_CHAT_MAX_RETRIES,
    error,
    config,
    activeCard,
    initializing,
    canSend,
    modeLabel,
    historyWindowHint,
    maxHistoryRounds,
    initSession,
    reloadConfig,
    clearSession,
    sendUserMessage,
    sessionId
  }
}
