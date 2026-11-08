<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  notifyTtsCloudConfigChanged,
  type TtsBackendKind
} from '../../services/ttsCloudSpeech'

import './chat-panel-theme.css'

const emit = defineEmits<{
  changed: []
}>()

const ttsBackend = ref<TtsBackendKind>('local')
const saving = ref(false)
const status = ref('')
const error = ref('')

onMounted(() => {
  void reload()
})

function applyView(c: { ttsBackend: TtsBackendKind }): void {
  ttsBackend.value = c.ttsBackend
}

async function reload(): Promise<void> {
  error.value = ''
  try {
    const result = await window.electronAPI?.getTtsCloudConfig?.()
    if (!result?.ok) {
      error.value = result?.detail || '加载云端 TTS 配置失败'
      return
    }
    applyView(result.config)
    notifyTtsCloudConfigChanged(result.config.ttsBackend)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载云端 TTS 配置失败'
  }
}

async function persist(
  patch: Parameters<NonNullable<typeof window.electronAPI>['setTtsCloudConfig']>[0],
  okMessage: string
): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await window.electronAPI?.setTtsCloudConfig?.(patch)
    if (!result?.ok) {
      error.value = result?.detail || '保存失败'
      return
    }
    applyView(result.config)
    notifyTtsCloudConfigChanged(result.config.ttsBackend)
    status.value = okMessage
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function chooseLocal(): Promise<void> {
  if (ttsBackend.value === 'local') return
  ttsBackend.value = 'local'
  await onBackendChange()
}

async function chooseCloud(): Promise<void> {
  if (ttsBackend.value !== 'local') return
  ttsBackend.value = 'qwen'
  await onBackendChange()
}

async function onBackendChange(): Promise<void> {
  await persist(
    { ttsBackend: ttsBackend.value === 'local' ? 'local' : ttsBackend.value },
    ttsBackend.value === 'local' ? '已切换到本地 TTS' : '已切换到云端 TTS'
  )
}
</script>

<template>
  <section class="tts-cloud-settings">
    <h3 class="chat-theme__section-title">语音后端</h3>
    <p class="chat-theme__hint">
      如果有下载本地 TTS 推理环境则可以选择使用本地 TTS 进行推理，默认推荐使用云端进行推理。阿里云的地址、模型和密钥在家窗口的声线挑选里填写。
    </p>

    <div class="tts-cloud-settings__modes">
      <label class="tts-cloud-settings__mode">
        <input
          type="radio"
          name="tts-backend"
          :checked="ttsBackend === 'local'"
          :disabled="saving"
          @change="chooseLocal"
        />
        <span>本地 TTS</span>
      </label>
      <label class="tts-cloud-settings__mode">
        <input
          type="radio"
          name="tts-backend"
          :checked="ttsBackend !== 'local'"
          :disabled="saving"
          @change="chooseCloud"
        />
        <span>云端 TTS</span>
      </label>
    </div>

    <p v-if="status" class="chat-theme__hint">{{ status }}</p>
    <p v-if="error" class="chat-theme__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.tts-cloud-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #fdf2f8;
}

.tts-cloud-settings__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tts-cloud-settings__mode,
.tts-cloud-settings__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.tts-cloud-settings__mode input {
  accent-color: #db2777;
}
</style>
