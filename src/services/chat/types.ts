/** 聊天 LLM 后端模式（枚举便于后续扩展） */
export type ChatLlmMode = 'local_llama' | 'openai_api'

/** 进入文字聊天的来源：关闭聊天窗时回到对应界面 */
export type ChatEntryOrigin = 'home' | 'pet'

/** 模型输出解析：OpenAI 形或自定义 JSON */
export type ChatOutputFormat = 'openai' | 'json_content'

export interface CharacterCard {
  id: string
  name: string
  rolePrompt: string
  likes: string
  /** M4 RAG 预留：关联记忆文档 id 列表 */
  ragDocumentIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface CharacterCardsStore {
  activeCardId: string
  cards: CharacterCard[]
}

export type ChatHistoryRole = 'user' | 'assistant' | 'system'

export interface ChatHistoryMessage {
  role: ChatHistoryRole
  content: string
}

export const DEFAULT_CHARACTER_CARD_ID = 'default'

/** 本地 llama-server 配置（模型由扫描列表选择，无需手填 URL/模型名） */
export interface LocalLlamaConfigView {
  selectedBaseUrl: string
  selectedModelId: string
  outputFormat: ChatOutputFormat
  temperature: number
}

/** 第三方 OpenAI 兼容 API 配置（用户填写 URL 与模型名） */
export interface OpenAiApiConfigView {
  baseUrl: string
  model: string
  outputFormat: ChatOutputFormat
  temperature: number
}

/** 聊天 TTS 并行推理并路（仅 parallel 模式） */
export type ChatTtsParallelLanes = 2 | 3 | 4

/** 持久化于 userData/chat-config.json（apiKey 仅主进程读写） */
export interface ChatConfig {
  llmMode: ChatLlmMode
  local: LocalLlamaConfigView
  openai: OpenAiApiConfigView
  /** 文字聊天是否朗读助手回复并对口型，默认 true */
  ttsEnabled: boolean
  /** 并行 TTS 推理；关闭时按句序串行（默认） */
  ttsParallelEnabled: boolean
  ttsParallelLanes: ChatTtsParallelLanes
  /** 开启时 Key 仅存主进程且不向渲染进程回显；关闭时以圆点掩码显示长度 */
  openaiApiKeySecretSave: boolean
  apiKey?: string
}

/** 渲染进程可见配置（不含 apiKey） */
export interface ChatConfigView {
  llmMode: ChatLlmMode
  local: LocalLlamaConfigView
  openai: OpenAiApiConfigView
  ttsEnabled: boolean
  ttsParallelEnabled: boolean
  ttsParallelLanes: ChatTtsParallelLanes
  openaiApiKeySecretSave: boolean
  hasApiKey: boolean
  /** 非私密保存时回显明文供原地编辑（password 框显示为圆点） */
  apiKey?: string
}

/** 本地 llama-server 探测结果 */
export interface LocalLlamaEndpoint {
  baseUrl: string
  online: boolean
  models: string[]
  error?: string
}

export interface LlmChatRequest {
  messages: ChatHistoryMessage[]
  model?: string
  stream?: boolean
  temperature?: number
}

export interface LlmChatResult {
  content: string
}

export type LlmStreamHandler = (delta: string) => void

/** UI 会话消息（含 id，便于流式更新） */
export interface ChatUiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'streaming' | 'done' | 'error'
}
