<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  notifyTtsCloudConfigChanged,
  type TtsBackendKind
} from '../../services/ttsCloudSpeech'
import { playChatAudioBlob } from '../../services/ttsPlayer'

import './chat-panel-theme.css'

const emit = defineEmits<{
  changed: []
}>()

const ttsBackend = ref<TtsBackendKind>('local')
const baseUrl = ref('https://dashscope.aliyuncs.com')
const vcModel = ref('qwen3-tts-vc-2026-01-22')
const vdModel = ref('qwen3-tts-vd-2026-01-26')
const voiceId = ref('')
const activeKind = ref<'vc' | 'vd' | null>(null)
const apiKeyInput = ref('')
const secretSave = ref(false)
const hasApiKey = ref(false)
const previewText = ref('你好，这是云端语音试听。')
const saving = ref(false)
const previewing = ref(false)
const status = ref('')
const error = ref('')

onMounted(() => {
  void reload()
})

function applyView(c: {
  ttsBackend: TtsBackendKind
  qwen: {
    baseUrl: string
    vcModel: string
    vdModel: string
    voiceId: string
    activeKind: 'vc' | 'vd' | null
    secretSave: boolean
    hasApiKey: boolean
    apiKey?: string
  }
}): void {
  ttsBackend.value = c.ttsBackend
  baseUrl.value = c.qwen.baseUrl
  vcModel.value = c.qwen.vcModel
  vdModel.value = c.qwen.vdModel
  voiceId.value = c.qwen.voiceId
  activeKind.value = c.qwen.activeKind
  secretSave.value = c.qwen.secretSave
  hasApiKey.value = c.qwen.hasApiKey
  if (c.qwen.apiKey != null) {
    apiKeyInput.value = c.qwen.apiKey
  }
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
    apiKeyInput.value = result.config.qwen.apiKey ?? ''
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
    if (secretSave.value) {
      apiKeyInput.value = ''
    } else if (result.config.qwen.apiKey != null) {
      apiKeyInput.value = result.config.qwen.apiKey
    }
    notifyTtsCloudConfigChanged(result.config.ttsBackend)
    status.value = okMessage
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function onBackendChange(): Promise<void> {
  await persist(
    { ttsBackend: ttsBackend.value },
    ttsBackend.value === 'qwen' ? '已切换到云端 TTS（百炼 Qwen）' : '已切换到本地 TTS'
  )
}

async function saveCloudFields(): Promise<void> {
  const patch: Parameters<NonNullable<typeof window.electronAPI>['setTtsCloudConfig']>[0] = {
    qwen: {
      baseUrl: baseUrl.value,
      vcModel: vcModel.value,
      vdModel: vdModel.value,
      secretSave: secretSave.value
    }
  }
  if (apiKeyInput.value.trim() || !secretSave.value) {
    patch.qwen!.apiKey = apiKeyInput.value
  }
  await persist(patch, '云端 TTS 配置已保存')
}

async function onSecretSaveToggle(): Promise<void> {
  await persist(
    { qwen: { secretSave: secretSave.value } },
    secretSave.value ? '已开启 Key 私密保存' : '已关闭 Key 私密保存'
  )
}

async function onPreview(): Promise<void> {
  if (previewing.value) return
  previewing.value = true
  error.value = ''
  status.value = ''
  try {
    await saveCloudFields()
    if (error.value) return
    const result = await window.electronAPI?.previewTtsCloud?.({ text: previewText.value })
    if (!result?.ok) {
      error.value = result?.detail || '试听失败'
      return
    }
    await playChatAudioBlob(new Blob([result.audio], { type: result.mime || 'audio/mpeg' }))
    status.value = '试听完成'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '试听失败'
  } finally {
    previewing.value = false
  }
}
</script>

<template>
  <section class="tts-cloud-settings">
    <h3 class="chat-theme__section-title">语音后端</h3>
    <p class="chat-theme__hint">
      本地 TTS 使用本机语音侧车；云端 TTS 走阿里百炼 Qwen3-TTS（可不启本地侧车）。请在音色工坊切到「云端」页做官方样本云克隆。
      可同时配置声音复刻（VC）与声音设计（VD）两套模型；合成会按当前音色类型自动选模。
    </p>

    <div class="tts-cloud-settings__modes">
      <label class="tts-cloud-settings__mode">
        <input
          v-model="ttsBackend"
          type="radio"
          value="local"
          :disabled="saving"
          @change="onBackendChange"
        />
        <span>本地 TTS</span>
      </label>
      <label class="tts-cloud-settings__mode">
        <input
          v-model="ttsBackend"
          type="radio"
          value="qwen"
          :disabled="saving"
          @change="onBackendChange"
        />
        <span>云端 TTS（百炼 Qwen）</span>
      </label>
    </div>

    <div class="tts-cloud-settings__fields">
      <label class="chat-theme__label" for="tts-cloud-base">百炼 baseUrl（主机根，勿填完整业务 path）</label>
      <input
        id="tts-cloud-base"
        v-model="baseUrl"
        class="chat-theme__input"
        type="text"
        placeholder="https://dashscope.aliyuncs.com"
        :disabled="saving"
        @blur="saveCloudFields"
      />
      <p class="chat-theme__hint">
        推荐填 https://dashscope.aliyuncs.com。克隆与试听共用此主机，但走不同接口。
      </p>

      <label class="chat-theme__label" for="tts-cloud-vc-model">声音复刻模型（VC）</label>
      <input
        id="tts-cloud-vc-model"
        v-model="vcModel"
        class="chat-theme__input"
        type="text"
        placeholder="qwen3-tts-vc-2026-01-22"
        :disabled="saving"
        @blur="saveCloudFields"
      />

      <label class="chat-theme__label" for="tts-cloud-vd-model">声音设计模型（VD）</label>
      <input
        id="tts-cloud-vd-model"
        v-model="vdModel"
        class="chat-theme__input"
        type="text"
        placeholder="qwen3-tts-vd-2026-01-26"
        :disabled="saving"
        @blur="saveCloudFields"
      />

      <label class="chat-theme__label" for="tts-cloud-voice">当前云端音色</label>
      <input
        id="tts-cloud-voice"
        class="chat-theme__input"
        type="text"
        :value="
          voiceId
            ? `${voiceId}${activeKind ? `（${activeKind === 'vd' ? 'VD' : 'VC'}）` : ''}`
            : '（尚未克隆）'
        "
        readonly
        disabled
      />

      <label class="chat-theme__label" for="tts-cloud-secret">API Key 保存方式</label>
      <label class="tts-cloud-settings__toggle">
        <input
          id="tts-cloud-secret"
          v-model="secretSave"
          type="checkbox"
          :disabled="saving"
          @change="onSecretSaveToggle"
        />
        <span>私密保存（Secret save）</span>
      </label>

      <label class="chat-theme__label" for="tts-cloud-key">
        API Key
        <span v-if="hasApiKey && secretSave" class="chat-theme__tag chat-theme__tag--ok">已配置</span>
      </label>
      <input
        id="tts-cloud-key"
        v-model="apiKeyInput"
        class="chat-theme__input"
        type="password"
        :placeholder="secretSave && hasApiKey ? '留空则不修改已保存的 Key' : '输入百炼 API Key'"
        autocomplete="off"
        :disabled="saving"
        @blur="saveCloudFields"
      />

      <label class="chat-theme__label" for="tts-cloud-preview-text">试听文本</label>
      <input
        id="tts-cloud-preview-text"
        v-model="previewText"
        class="chat-theme__input"
        type="text"
        :disabled="previewing || saving"
      />
      <button
        type="button"
        class="chat-theme__button"
        :disabled="previewing || saving"
        @click="onPreview"
      >
        {{ previewing ? '试听中…' : '试听云端音色' }}
      </button>
      <p class="chat-theme__hint">
        试听需要已云克隆的音色；按当前音色类型自动选用 VC 或 VD 模型。
      </p>
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

.tts-cloud-settings__mode input,
.tts-cloud-settings__toggle input {
  accent-color: #db2777;
}

.tts-cloud-settings__fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-theme__button {
  align-self: flex-start;
  margin-top: 4px;
  padding: 8px 14px;
  border: 1px solid #f9a8d4;
  border-radius: 10px;
  background: #fff;
  color: #9d174d;
  font-size: 13px;
  cursor: pointer;
}

.chat-theme__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
