<script setup lang="ts">
import type { ScreenCompanionConfigView } from '../../services/screenCompanion/types'

import './chat-panel-theme.css'

const props = defineProps<{
  config: ScreenCompanionConfigView
  visionApiKeyInput: string
  hasVisionApiKey: boolean
  visionApiKeySecretSave: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  'update:visionApiKeyInput': [value: string]
  'update:configVision': [patch: { visionBaseUrl?: string; visionModel?: string }]
  'update:visionApiKeySecretSave': [value: boolean]
  save: []
  clearKey: []
}>()

function onKeyInput(event: Event): void {
  emit('update:visionApiKeyInput', (event.target as HTMLInputElement).value)
}

function onSecretSaveChange(event: Event): void {
  emit('update:visionApiKeySecretSave', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="sc-vision">
    <h4 class="chat-theme__section-title sc-vision__subtitle">视觉识图 API</h4>
    <p class="chat-theme__hint">
      独立配置，与聊天 OpenAI 密钥分开。摘要仅保留文字，原图不落盘。
    </p>
    <div class="sc-vision__field">
      <label class="chat-theme__label" for="sc-vision-url">API URL</label>
      <input
        id="sc-vision-url"
        class="chat-theme__input"
        type="text"
        :value="config.visionBaseUrl"
        placeholder="https://api.openai.com/v1"
        :disabled="saving"
        @input="emit('update:configVision', { visionBaseUrl: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="sc-vision__field">
      <label class="chat-theme__label" for="sc-vision-model">模型名称</label>
      <input
        id="sc-vision-model"
        class="chat-theme__input"
        type="text"
        :value="config.visionModel"
        placeholder="gpt-4o"
        :disabled="saving"
        @input="emit('update:configVision', { visionModel: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="sc-vision__field">
      <label class="chat-theme__label" for="sc-vision-key-secret-save">API Key 保存方式</label>
      <label class="sc-vision__toggle">
        <input
          id="sc-vision-key-secret-save"
          type="checkbox"
          :checked="visionApiKeySecretSave"
          :disabled="saving"
          @change="onSecretSaveChange"
        />
        <span>私密保存（Secret save）</span>
      </label>
      <p class="chat-theme__hint">
        {{
          visionApiKeySecretSave
            ? '已开启：保存后不显示 Key 内容，仅提示「已配置」。'
            : '默认关闭：已保存的 Key 可在下方输入框直接修改，以圆点显示。'
        }}
      </p>
    </div>
    <div class="sc-vision__field">
      <label class="chat-theme__label" for="sc-vision-key">
        API Key
        <span
          v-if="hasVisionApiKey && visionApiKeySecretSave"
          class="chat-theme__tag chat-theme__tag--ok"
        >已配置</span>
      </label>
      <input
        id="sc-vision-key"
        class="chat-theme__input"
        type="password"
        :value="visionApiKeyInput"
        :placeholder="
          visionApiKeySecretSave && hasVisionApiKey ? '留空则不修改已保存的 Key' : '输入 API Key'
        "
        autocomplete="off"
        :disabled="saving"
        @input="onKeyInput"
      />
      <p v-if="!visionApiKeySecretSave" class="chat-theme__hint">
        可直接在此修改；内容以圆点显示，不会展示明文。
      </p>
    </div>
    <div class="sc-vision__actions">
      <button type="button" class="chat-theme__btn" :disabled="saving" @click="emit('save')">
        保存视觉配置
      </button>
      <button
        v-if="hasVisionApiKey"
        type="button"
        class="chat-theme__btn chat-theme__btn--ghost"
        :disabled="saving"
        @click="emit('clearKey')"
      >
        清除 Key
      </button>
    </div>
  </div>
</template>

<style scoped>
.sc-vision {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #bfdbfe;
  border-radius: 12px;
  background: #f8fafc;
}

.sc-vision__subtitle {
  margin: 0;
  font-size: 13px;
}

.sc-vision__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-vision__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.sc-vision__toggle input {
  accent-color: #2563eb;
}

.sc-vision__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
