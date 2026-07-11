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
}): Promise<ChatHistoryMessage[]> {
  const lcHistory = input.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => [m.role === 'user' ? 'human' : 'ai', m.content] as const)

  const messages = await chatPromptTemplate.formatMessages({
    system_prompt: formatCharacterSystemPrompt(input.card),
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
