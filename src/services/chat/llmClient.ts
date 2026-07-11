import type { ChatConfigView, LlmChatRequest, LlmChatResult, LlmStreamHandler } from './types'
import { createDefaultChatConfigView } from './chatConfigDefaults'
import { LLM_CHAT_TIMEOUT_MS, LLM_DEFAULT_TEMPERATURE } from './llmConstants'
import { parseCompletionBody } from './llmOutputParser'
import { readChatCompletionStream } from './llmStream'

function buildUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function resolveLocalModel(config: ChatConfigView, request: LlmChatRequest): string {
  return (request.model ?? config.local.selectedModelId).trim()
}

function resolveOpenAiModel(config: ChatConfigView, request: LlmChatRequest): string {
  return (request.model ?? config.openai.model).trim()
}

function mapFetchError(err: unknown, local: boolean): Error {
  if (err instanceof Error && err.name === 'AbortError') {
    return new Error('LLM 请求超时')
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/fetch failed|Failed to fetch|ECONNREFUSED/i.test(message)) {
    return new Error(local ? '无法连接 llama-server，请先扫描并选择本地模型' : '无法连接 OpenAI API')
  }
  return new Error(message)
}

async function localLlamaChat(
  config: ChatConfigView,
  request: LlmChatRequest,
  onStream?: LlmStreamHandler
): Promise<LlmChatResult> {
  const baseUrl = config.local.selectedBaseUrl.trim()
  const model = resolveLocalModel(config, request)
  if (!baseUrl) throw new Error('请先在本地模型列表中选择 llama-server')
  if (!model) throw new Error('请先在本地模型列表中选择模型')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_CHAT_TIMEOUT_MS)
  const body = {
    model,
    messages: request.messages,
    stream: Boolean(request.stream),
    temperature: request.temperature ?? config.local.temperature ?? LLM_DEFAULT_TEMPERATURE
  }

  try {
    const response = await fetch(buildUrl(baseUrl, '/v1/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`llama-server ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }

    if (request.stream && response.body) {
      const content = await readChatCompletionStream(response.body, config.local.outputFormat, onStream)
      return { content }
    }

    const json = (await response.json()) as unknown
    return { content: parseCompletionBody(json, config.local.outputFormat) }
  } catch (err) {
    throw mapFetchError(err, true)
  } finally {
    clearTimeout(timer)
  }
}

async function openAiChatViaIpc(
  config: ChatConfigView,
  request: LlmChatRequest
): Promise<LlmChatResult> {
  if (!window.electronAPI?.chatOpenAiCompletion) {
    throw new Error('当前环境不支持 OpenAI API 代理')
  }
  if (!config.hasApiKey) {
    throw new Error('请先在 OpenAI 配置中设置 API Key')
  }
  const model = resolveOpenAiModel(config, request)
  if (!model) {
    throw new Error('请先在 OpenAI 配置中填写模型名称')
  }

  const result = await window.electronAPI.chatOpenAiCompletion({
    messages: JSON.parse(JSON.stringify(request.messages)),
    model,
    stream: Boolean(request.stream),
    temperature: request.temperature ?? config.openai.temperature ?? LLM_DEFAULT_TEMPERATURE,
    outputFormat: config.openai.outputFormat
  })

  if (!result.ok) {
    const status = result.status
    const detail = result.detail ?? 'OpenAI API 请求失败'
    throw new Error(status ? `OpenAI API ${status}: ${detail}` : detail)
  }
  return { content: result.content }
}

/** 统一 LLM 对话入口：local_llama 直连；openai_api 走主进程 IPC（固定非流式） */
export async function llmChat(
  config: ChatConfigView,
  request: LlmChatRequest,
  onStream?: LlmStreamHandler
): Promise<LlmChatResult> {
  if (config.llmMode === 'local_llama') {
    return localLlamaChat(config, request, onStream)
  }
  return openAiChatViaIpc(config, { ...request, stream: false })
}

export { createDefaultChatConfigView } from './chatConfigDefaults'
