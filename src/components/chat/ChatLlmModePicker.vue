<script setup lang="ts">
import { useChatLlmSettingsContext } from '../../composables/chat/chatLlmSettingsContext'

import './chat-panel-theme.css'

const { config, switchActiveMode } = useChatLlmSettingsContext()

const isLocalMode = () => config.value?.llmMode === 'local_llama'
const isOpenAiMode = () => config.value?.llmMode === 'openai_api'
</script>

<template>
  <section class="llm-settings__mode">
    <h3 class="chat-theme__section-title">对话后端</h3>
    <p class="chat-theme__hint">选择文字聊天使用的模型来源，修改后会自动保存，下次进入聊天无需重新设置。</p>
    <div class="llm-settings__mode-options">
      <label class="llm-settings__mode-option" :class="{ 'llm-settings__mode-option--active': isLocalMode() }">
        <input
          type="radio"
          name="chat-llm-mode"
          value="local_llama"
          :checked="isLocalMode()"
          @change="switchActiveMode('local_llama')"
        />
        <span>本地大模型（llama-server）</span>
      </label>
      <label class="llm-settings__mode-option" :class="{ 'llm-settings__mode-option--active': isOpenAiMode() }">
        <input
          type="radio"
          name="chat-llm-mode"
          value="openai_api"
          :checked="isOpenAiMode()"
          @change="switchActiveMode('openai_api')"
        />
        <span>第三方 OpenAI API</span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.llm-settings__mode {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #fdf2f8;
}

.llm-settings__mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.llm-settings__mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}

.llm-settings__mode-option--active {
  border-color: #f472b6;
  background: #fdf2f8;
  color: #9d174d;
  font-weight: 600;
}

.llm-settings__mode-option input {
  accent-color: #db2777;
}
</style>
