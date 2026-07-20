import { inject, type InjectionKey } from 'vue'

import type { useChatLlmSettings } from './useChatLlmSettings'

export type ChatLlmSettingsContext = ReturnType<typeof useChatLlmSettings>

export const CHAT_LLM_SETTINGS_KEY: InjectionKey<ChatLlmSettingsContext> =
  Symbol('chatLlmSettings')

export function useChatLlmSettingsContext(): ChatLlmSettingsContext {
  const ctx = inject(CHAT_LLM_SETTINGS_KEY)
  if (!ctx) {
    throw new Error('ChatLlmSettings 未注入，请在 ChatLlmSettings.vue 内使用')
  }
  return ctx
}
