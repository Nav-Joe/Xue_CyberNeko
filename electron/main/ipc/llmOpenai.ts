import { ipcMain } from 'electron'

import { getChatConfigSecrets, readChatConfigFile } from '../chat/chat-config'
import { proxyOpenAiCompletion, proxyOpenAiListModels } from '../chat/openai-proxy'
import type { ChatHistoryMessage, ChatOutputFormat } from '../../../src/services/chat/types'

interface OpenAiCompletionPayload {
  messages: ChatHistoryMessage[]
  model: string
  stream?: boolean
  temperature?: number
  outputFormat: ChatOutputFormat
}

export function registerLlmOpenaiIpc(): void {
  ipcMain.handle('chat-openai-completion', async (_event, payload: OpenAiCompletionPayload) => {
    try {
      const config = readChatConfigFile()
      const secrets = getChatConfigSecrets()
      return await proxyOpenAiCompletion({
        baseUrl: secrets.openai.baseUrl,
        apiKey: secrets.apiKey ?? '',
        messages: JSON.parse(JSON.stringify(payload.messages)),
        model: payload.model,
        stream: Boolean(payload.stream),
        temperature: payload.temperature ?? secrets.openai.temperature,
        outputFormat: payload.outputFormat
      })
    } catch (err) {
      return {
        ok: false as const,
        detail: err instanceof Error ? err.message : 'OpenAI 请求失败'
      }
    }
  })

  ipcMain.handle('chat-openai-list-models', async () => {
    try {
      const config = readChatConfigFile()
      const secrets = getChatConfigSecrets()
      return await proxyOpenAiListModels(secrets.openai.baseUrl, secrets.apiKey ?? '')
    } catch (err) {
      return {
        ok: false as const,
        detail: err instanceof Error ? err.message : '获取模型列表失败'
      }
    }
  })
}
