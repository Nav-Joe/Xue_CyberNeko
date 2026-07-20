<script setup lang="ts">
import { useChatLlmSettingsContext } from '../../composables/chat/chatLlmSettingsContext'
import { DEFAULT_LOCAL_MODEL_ID } from '../../services/chat/llmConstants'
import { computeDownloadPercent, formatDownloadProgressText } from '../../utils/formatBytes'

import './chat-panel-theme.css'

const {
  localStatus,
  scanError,
  onlineEndpoints,
  scanning,
  hasLocalModelFile,
  localModelFilename,
  modelDownloading,
  modelDownloadMessage,
  modelDownloadProgress,
  localDraft,
  scanLocalLlama,
  downloadLocalModel,
  cancelLocalModelDownload,
  selectLocalModel,
  isLocalModelSelected
} = useChatLlmSettingsContext()

function hasModelDownloadProgress(progress: { done: number; total: number } | null): boolean {
  return Boolean(progress && (progress.total > 0 || progress.done > 0))
}

function modelDownloadPercent(progress: { done: number; total: number } | null): number {
  if (!progress) return 0
  return computeDownloadPercent(progress.done, progress.total)
}
</script>

<template>
  <section class="llm-settings__block">
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
      <button
        type="button"
        class="chat-theme__btn chat-theme__btn--ghost llm-settings__cancel-download"
        @click="cancelLocalModelDownload"
      >
        取消下载
      </button>
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

.llm-settings__cancel-download {
  margin-top: 10px;
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
</style>
