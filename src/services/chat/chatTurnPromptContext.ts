/**
 * 发送前 Prompt 上下文：历史窗口 + 记忆/欲望/好感/摸摸注入。
 *
 * 分档（①）：此处只做「读完再注入」的 await；禁止夹带总结 / 滚周 / 轮后鉴定 LLM。
 * 开局后台（②）如 maybeRunPeriodRollup：只点火，不要 await。
 * 详见 memory CONTRACT「与聊天发送路径的调度分档」。
 */
import {
  maxHistoryRoundsForMode,
  trimHistoryToRounds
} from './historyWindow'
import { toHistoryMessages } from './chatSessionHistory'
import {
  consumePendingPeeksForUserTurn,
  getMemoryPromptBlock,
  getRecentMemoryHistory,
  maybeRunPeriodRollup
} from '../memory/memoryClient'
import { getDesirePromptBlock } from '../desire/desireClient'
import { getRelationshipPromptBlock } from '../relationship/relationshipClient'
import { getPetTouchPromptBlock } from '../petTouch/petTouchClient'
import type {
  ChatHistoryMessage,
  ChatLlmMode,
  ChatUiMessage
} from './types'

export type ChatTurnPromptContext = {
  priorHistory: ChatHistoryMessage[]
  llmUserInput: string
  memoryBlock: string
  desireBlock: string
  relationshipBlock: string
  petTouchBlock: string
}

export async function resolveChatTurnPromptContext(input: {
  llmMode: ChatLlmMode
  memoryEnabled: boolean
  desireEnabled: boolean
  uiMessages: ChatUiMessage[]
  userText: string
}): Promise<ChatTurnPromptContext> {
  const maxRounds = maxHistoryRoundsForMode(input.llmMode)
  let priorHistory = trimHistoryToRounds(toHistoryMessages(input.uiMessages), maxRounds)
  let memoryBlock = ''
  let desireBlock = ''
  let relationshipBlock = ''
  let petTouchBlock = ''
  let llmUserInput = input.userText

  if (input.memoryEnabled) {
    // ② 开局后台：不要 await，免得卡住第一句回复
    maybeRunPeriodRollup()
    // ① 下面这些要等：历史、记忆注入、偷看前缀（只读，不要在这里跑总结 LLM）
    const fromDb = await getRecentMemoryHistory(maxRounds)
    if (fromDb !== null) {
      priorHistory = fromDb
    }
    memoryBlock = await getMemoryPromptBlock(input.userText)
    const peekPrefix = await consumePendingPeeksForUserTurn()
    if (peekPrefix) {
      llmUserInput = `${peekPrefix}\n${input.userText}`
    }
    // 欲望注入依赖记忆总闸；此处只做重逢+注入，不轮扣
    if (input.desireEnabled) {
      desireBlock = await getDesirePromptBlock()
    }
    // 好感只读注入（随官方情感模拟插件总闸）
    if (input.desireEnabled) {
      relationshipBlock = await getRelationshipPromptBlock()
    }
    // 摸摸：只读并入 system（不另开 LLM；不绑情感插件）
    petTouchBlock = await getPetTouchPromptBlock()
  }

  return {
    priorHistory,
    llmUserInput,
    memoryBlock,
    desireBlock,
    relationshipBlock,
    petTouchBlock
  }
}
