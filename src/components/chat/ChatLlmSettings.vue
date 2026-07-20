<script setup lang="ts">
import { onMounted, provide, toRef } from 'vue'

import { CHAT_LLM_SETTINGS_KEY } from '../../composables/chat/chatLlmSettingsContext'
import { useChatLlmSettings } from '../../composables/chat/useChatLlmSettings'
import type { CharacterCard } from '../../services/chat/types'

import ChatLlmLocalSettings from './ChatLlmLocalSettings.vue'
import ChatLlmModePicker from './ChatLlmModePicker.vue'
import ChatLlmOpenAiSettings from './ChatLlmOpenAiSettings.vue'

import './chat-panel-theme.css'

const props = defineProps<{
  card: CharacterCard | null
  ensureLocalLlamaReady?: () => Promise<boolean>
}>()

const emit = defineEmits<{
  changed: []
}>()

const cardRef = toRef(props, 'card')

const llm = useChatLlmSettings(() => cardRef.value, {
  onConfigSaved: () => emit('changed'),
  ensureLocalLlamaReady: props.ensureLocalLlamaReady
})

provide(CHAT_LLM_SETTINGS_KEY, llm)

const { config, configLoading, configError, reloadConfig, scanLocalLlama } = llm

const isLocalMode = () => config.value?.llmMode === 'local_llama'
const isOpenAiMode = () => config.value?.llmMode === 'openai_api'

onMounted(async () => {
  await reloadConfig()
  await scanLocalLlama()
})
</script>

<template>
  <div class="llm-settings">
    <p v-if="configLoading" class="chat-theme__hint">加载配置…</p>
    <p v-if="configError" class="chat-theme__error">{{ configError }}</p>

    <ChatLlmModePicker />
    <ChatLlmLocalSettings v-if="isLocalMode()" />
    <ChatLlmOpenAiSettings v-if="isOpenAiMode()" />
  </div>
</template>

<style scoped>
.llm-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 0;
  border-top: none;
}
</style>
