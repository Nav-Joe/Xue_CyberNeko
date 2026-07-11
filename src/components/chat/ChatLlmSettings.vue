<script setup lang="ts">
import { onMounted, toRef } from 'vue'

import { useChatLlmSettings } from '../../composables/chat/useChatLlmSettings'
import { DEFAULT_LOCAL_MODEL_ID } from '../../services/chat/llmConstants'
import type { CharacterCard } from '../../services/chat/types'
import { computeDownloadPercent, formatDownloadProgressText } from '../../utils/formatBytes'

import './chat-panel-theme.css'

const props = defineProps<{
  card: CharacterCard | null
  ensureLocalLlamaReady?: () => Promise<boolean>
}>()

const emit = defineEmits<{
  changed: []
}>()

const cardRef = toRef(props, 'card')

const {
  config,
  configLoading,
  configError,
  localStatus,
  openAiStatus,
  onlineEndpoints,
  scanning,
  scanError,
  hasLocalModelFile,
  localModelFilename,
  modelDownloading,
  modelDownloadMessage,
  modelDownloadProgress,
  localDraft,
  openAiDraft,
  apiKeyInput,
  reloadConfig,
  scanLocalLlama,
  downloadLocalModel,
  selectLocalModel,
  isLocalModelSelected,
  saveOpenAiConfig,
  onOpenAiApiKeySecretSaveToggle,
  switchActiveMode
} = useChatLlmSettings(() => cardRef.value, {
  onConfigSaved: () => emit('changed'),
  ensureLocalLlamaReady: props.ensureLocalLlamaReady
})

const isLocalMode = () => config.value?.llmMode === 'local_llama'
const isOpenAiMode = () => config.value?.llmMode === 'openai_api'

onMounted(async () => {
  await reloadConfig()
  await scanLocalLlama()
})

function hasModelDownloadProgress(progress: { done: number; total: number } | null): boolean {
  return Boolean(progress && (progress.total > 0 || progress.done > 0))
}

function modelDownloadPercent(progress: { done: number; total: number } | null): number {
  if (!progress) return 0
  return computeDownloadPercent(progress.done, progress.total)
}
</script>

<template>
  <div class="llm-settings">
    <p v-if="configLoading" class="chat-theme__hint">加载配置…</p>
    <p v-if="configError" class="chat-theme__error">{{ configError }}</p>

    <section class="llm-settings__mode">
      <h3 class="chat-theme__section-title">对话后端</h3>
      <p class="chat-theme__hint">选择文字聊天使用的模型来源；修改后会自动保存，下次进入聊天无需重新设置。</p>
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

    <section v-if="isLocalMode()" class="llm-settings__block">
      <h3 class="chat-theme__section-title">本地大模型</h3>
      <p class="chat-theme__hint">自动扫描本机 OpenAI 兼容端点，从列表选择模型，无需手填 URL。</p>
      <p v-if="localStatus" class="chat-theme__hint">{{ localStatus }}</p>
      <p v-if="scanError" class="chat-theme__error">{{ scanError }}</p>

      <p v-if="hasLocalModelFile && localModelFilename" class="chat-theme__hint">
        本地模型文件：{{ localModelFilename }}
      </p>
      <p v-else class="chat-theme__hint">未检测到本地 GGUF 模型文件，可先下载或连接外部 llama-server。</p>

      <div class="llm-settings__actions">
        <button
          type="button"
          class="chat-theme__btn"
          :disabled="modelDownloading || hasLocalModelFile"
          @click="downloadLocalModel"
        >
          {{
            modelDownloading
              ? '下载中…'
              : hasLocalModelFile
                ? '本地模型已就绪'
                : `下载本地大模型（${DEFAULT_LOCAL_MODEL_ID}）`
          }}
        </button>
        <button
          type="button"
          class="chat-theme__btn chat-theme__btn--ghost"
          :disabled="scanning || modelDownloading"
          @click="scanLocalLlama"
        >
          {{ scanning ? '扫描中…' : '重新扫描' }}
        </button>
      </div>

      <div v-if="modelDownloading" class="llm-settings__download-progress">
        <p class="chat-theme__hint">{{ modelDownloadMessage || `正在下载 ${DEFAULT_LOCAL_MODEL_ID}…` }}</p>
        <div v-if="hasModelDownloadProgress(modelDownloadProgress)" class="llm-settings__progress-bar">
          <div
            class="llm-settings__progress-fill"
            :style="{
              width: modelDownloadProgress?.total
                ? `${modelDownloadPercent(modelDownloadProgress)}%`
                : modelDownloadProgress?.done
                  ? '66%'
                  : '0%'
            }"
          />
        </div>
        <p v-if="modelDownloadProgress" class="chat-theme__hint llm-settings__progress-text">
          {{ formatDownloadProgressText(modelDownloadProgress.done, modelDownloadProgress.total) }}
        </p>
      </div>

      <div v-if="onlineEndpoints.length" class="llm-settings__endpoint-list">
        <article
          v-for="endpoint in onlineEndpoints"
          :key="endpoint.baseUrl"
          class="chat-theme__card"
          :class="{ 'chat-theme__card--active': localDraft?.selectedBaseUrl === endpoint.baseUrl }"
        >
          <header class="llm-settings__endpoint-head">
            <strong>{{ endpoint.baseUrl }}</strong>
            <span class="chat-theme__tag chat-theme__tag--ok">在线</span>
          </header>
          <template v-if="endpoint.models.length">
            <label
              v-for="modelId in endpoint.models"
              :key="`${endpoint.baseUrl}:${modelId}`"
              class="chat-theme__model-row"
            >
              <input
                type="radio"
                name="local-llama-model"
                :checked="isLocalModelSelected(endpoint.baseUrl, modelId)"
                @change="selectLocalModel(endpoint.baseUrl, modelId)"
              />
              <span>{{ modelId }}</span>
            </label>
          </template>
          <p v-else class="chat-theme__hint">无可用模型</p>
        </article>
      </div>
      <p v-else-if="!scanning && !modelDownloading" class="chat-theme__empty">无本地大模型在线</p>

      <template v-if="localDraft">
        <div class="llm-settings__field">
          <label class="chat-theme__label" for="local-output-format">输出格式</label>
          <select id="local-output-format" v-model="localDraft.outputFormat" class="chat-theme__select">
            <option value="openai">openai</option>
            <option value="json_content">json_content</option>
          </select>
        </div>
        <div class="llm-settings__field">
          <label class="chat-theme__label" for="local-temp">temperature</label>
          <input id="local-temp" v-model.number="localDraft.temperature" class="chat-theme__input" type="number" min="0" max="2" step="0.1" />
        </div>
        <p v-if="localDraft.selectedModelId" class="chat-theme__hint">
          当前选择：{{ localDraft.selectedBaseUrl }} / {{ localDraft.selectedModelId }}
        </p>
      </template>
    </section>

    <section v-if="isOpenAiMode()" class="llm-settings__block">
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

.llm-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.llm-settings__endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.llm-settings__endpoint-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #374151;
}

.llm-settings__check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
}

.llm-settings__download-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fdf2f8;
  border: 1px solid #fbcfe8;
}

.llm-settings__progress-bar {
  height: 8px;
  border-radius: 999px;
  background: #fce7f3;
  overflow: hidden;
}

.llm-settings__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f472b6, #be185d);
  transition: width 0.25s ease;
}

.llm-settings__progress-text {
  margin: 0;
  text-align: center;
}

.chat-theme__empty {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
  text-align: center;
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
