<script setup lang="ts">
import { useChatLlmSettingsContext } from '../../composables/chat/chatLlmSettingsContext'

import './chat-panel-theme.css'

const {
  config,
  openAiStatus,
  openAiDraft,
  apiKeyInput,
  openaiApiKeySecretSave,
  openAiSaving,
  saveOpenAiConfig,
  onOpenAiApiKeySecretSaveToggle
} = useChatLlmSettingsContext()
</script>

<template>
  <section class="llm-settings__block">
    <h3 class="chat-theme__section-title">第三方 OpenAI API</h3>
    <p class="chat-theme__hint">填写接口地址、模型名与 API Key；Key 仅存本机主进程。</p>
    <p v-if="openAiStatus" class="chat-theme__hint">{{ openAiStatus }}</p>

    <template v-if="openAiDraft">
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-url">API URL</label>
        <input id="openai-url" v-model="openAiDraft.baseUrl" class="chat-theme__input" type="text" placeholder="https://api.openai.com/v1" />
      </div>
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-model">模型名称</label>
        <input id="openai-model" v-model="openAiDraft.model" class="chat-theme__input" type="text" placeholder="gpt-4o-mini" />
      </div>
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-format">输出格式</label>
        <select id="openai-format" v-model="openAiDraft.outputFormat" class="chat-theme__select">
          <option value="openai">openai</option>
          <option value="json_content">json_content</option>
        </select>
      </div>
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-temp">temperature</label>
        <input id="openai-temp" v-model.number="openAiDraft.temperature" class="chat-theme__input" type="number" min="0" max="2" step="0.1" />
      </div>
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-key-secret-save">API Key 保存方式</label>
        <label class="llm-settings__toggle">
          <input
            id="openai-key-secret-save"
            v-model="openaiApiKeySecretSave"
            type="checkbox"
            :disabled="openAiSaving"
            @change="onOpenAiApiKeySecretSaveToggle"
          />
          <span>私密保存（Secret save）</span>
        </label>
        <p class="chat-theme__hint">
          {{
            openaiApiKeySecretSave
              ? '已开启：保存后不显示 Key 内容，仅提示「已配置」。'
              : '默认关闭：已保存的 Key 可在下方输入框直接修改，以圆点显示。'
          }}
        </p>
      </div>
      <div class="llm-settings__field">
        <label class="chat-theme__label" for="openai-key">
          API Key
          <span v-if="config?.hasApiKey && openaiApiKeySecretSave" class="chat-theme__tag chat-theme__tag--ok">已配置</span>
        </label>
        <input
          id="openai-key"
          v-model="apiKeyInput"
          class="chat-theme__input"
          type="password"
          :placeholder="openaiApiKeySecretSave && config?.hasApiKey ? '留空则不修改已保存的 Key' : '输入 API Key'"
          autocomplete="off"
          @blur="saveOpenAiConfig({ includeApiKey: true })"
        />
        <p v-if="!openaiApiKeySecretSave" class="chat-theme__hint">可直接在此修改；内容以圆点显示，不会展示明文。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.llm-settings__block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #fdf2f8;
}

.llm-settings__block:last-child {
  border-bottom: none;
}

.llm-settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.llm-settings__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.llm-settings__toggle input {
  accent-color: #db2777;
}
</style>
