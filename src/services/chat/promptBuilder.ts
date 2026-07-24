import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

import type { CharacterCard, ChatHistoryMessage, ChatHistoryRole } from './types'

function mapLangChainRole(type: string): ChatHistoryRole {
  if (type === 'human') return 'user'
  if (type === 'ai') return 'assistant'
  return 'system'
}

/** 角色卡 → system 文本（供 llama / OpenAI 共用） */
export function formatCharacterSystemPrompt(card: CharacterCard): string {
  const chunks: string[] = []
  if (card.rolePrompt.trim()) chunks.push(card.rolePrompt.trim())
  if (card.name.trim()) chunks.push(`你的名字是「${card.name.trim()}」。`)
  if (card.likes.trim()) chunks.push(`喜好：${card.likes.trim()}`)
  return chunks.join('\n\n')
}

/** 本轮对话发起时的本地时间（写入 system，让模型知道几点） */
export function formatChatLocalTimeLabel(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const y = now.getFullYear()
  const m = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  return `当前本地时间：${y}-${m}-${d} ${hh}:${mm}（周${weekdays[now.getDay()]}）`
}

const chatPromptTemplate = ChatPromptTemplate.fromMessages([
  ['system', '{system_prompt}'],
  new MessagesPlaceholder('history'),
  ['human', '{input}']
])

/** 使用 ChatPromptTemplate 生成 LangChain 消息，再转为 llama/OpenAI 通用形 */
export async function buildChatPromptMessages(input: {
  card: CharacterCard
  history: ChatHistoryMessage[]
  userInput: string
  /** M4.2：核心记忆 + 加权摘要纯文本块，拼入 system */
  memoryBlock?: string
  /** 覆盖「现在」；默认 new Date()；单测可注入 */
  now?: Date
}): Promise<ChatHistoryMessage[]> {
  const lcHistory = input.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => [m.role === 'user' ? 'human' : 'ai', m.content] as const)

  const baseSystem = formatCharacterSystemPrompt(input.card)
  const clock = formatChatLocalTimeLabel(input.now ?? new Date())
  const memory = input.memoryBlock?.trim()
  const system_prompt = memory
    ? `${baseSystem}\n\n${clock}\n\n${memory}`
    : `${baseSystem}\n\n${clock}`

  const messages = await chatPromptTemplate.formatMessages({
    system_prompt,
    history: lcHistory,
    input: input.userInput
  })

  return messages.map((msg) => ({
    role: mapLangChainRole(msg.getType()),
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
  }))
}

/** M4 RAG 预留：返回角色卡关联的记忆文档 id */
export function listCharacterRagDocumentIds(card: CharacterCard): string[] {
  return card.ragDocumentIds ?? []
}
