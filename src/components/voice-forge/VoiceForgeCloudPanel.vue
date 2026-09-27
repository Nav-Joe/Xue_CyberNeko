<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { notifyTtsCloudConfigChanged } from '../../services/ttsCloudSpeech'
import VoiceForgeCloudCorpusTab from './VoiceForgeCloudCorpusTab.vue'
import VoiceForgeCloudCreateTab from './VoiceForgeCloudCreateTab.vue'

type CloudTab = 'list' | 'create' | 'clone' | 'corpus'
type VoiceRow = {
  id: string
  kind: 'vc' | 'vd'
  name: string
  voiceId: string
  createdAt: number
}

const emit = defineEmits<{
  'voice-creation-started': []
  'layout-change': []
}>()

const tab = ref<CloudTab>('create')
const voices = ref<VoiceRow[]>([])
const activeVoiceLocalId = ref('')
const vcModel = ref('')
const vdModel = ref('')
const hasApiKey = ref(false)

const busy = ref(false)
const status = ref('')
const error = ref('')

const customName = ref('')
const customTranscript = ref('')

onMounted(() => {
  void reload()
})

function applyConfig(c: {
  ttsBackend: 'local' | 'qwen'
  qwen: {
    voices: VoiceRow[]
    activeVoiceLocalId: string
    vcModel: string
    vdModel: string
    hasApiKey: boolean
  }
}): void {
  voices.value = c.qwen.voices.map((v) => ({ ...v }))
  activeVoiceLocalId.value = c.qwen.activeVoiceLocalId
  vcModel.value = c.qwen.vcModel
  vdModel.value = c.qwen.vdModel
  hasApiKey.value = c.qwen.hasApiKey
  notifyTtsCloudConfigChanged(c.ttsBackend)
}

async function reload(): Promise<void> {
  error.value = ''
  try {
    const result = await window.electronAPI?.getTtsCloudConfig?.()
    if (!result?.ok) {
      error.value = result?.detail || '加载云端 TTS 配置失败'
      return
    }
    applyConfig(result.config)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载云端 TTS 配置失败'
  }
}

async function setActive(localId: string): Promise<void> {
  if (busy.value || localId === activeVoiceLocalId.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await window.electronAPI?.setTtsCloudConfig?.({
      qwen: { activeVoiceLocalId: localId }
    })
    if (!result?.ok) {
      error.value = result?.detail || '切换失败'
      return
    }
    applyConfig(result.config)
    status.value = '已切换当前云端音色'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换失败'
  } finally {
    busy.value = false
  }
}

async function onRemove(localId: string): Promise<void> {
  if (busy.value) return
  const row = voices.value.find((v) => v.id === localId)
  const ok = window.confirm(
    `删除音色「${row?.name ?? localId}」？\n会尝试同时从百炼账号删除；失败时仍会从本机列表移除。`
  )
  if (!ok) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await window.electronAPI?.removeTtsCloudVoice?.({ localId })
    if (!result?.ok) {
      error.value = result?.detail || '删除失败'
      return
    }
    applyConfig(result.config)
    status.value = result.remoteDeleted
      ? '已删除本地与云端音色'
      : '已从本机列表删除（云端删除可能未成功）'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    busy.value = false
  }
}

async function onEnrollOfficial(): Promise<void> {
  if (busy.value) return
  if (!hasApiKey.value) {
    error.value = '请先在聊天设置填写百炼 API Key'
    return
  }
  busy.value = true
  error.value = ''
  status.value = '正在上传官方样本并云克隆…'
  try {
    const result = await window.electronAPI?.enrollOfficialTtsCloud?.()
    if (!result?.ok) {
      error.value = result?.detail || '云克隆失败'
      status.value = ''
      return
    }
    applyConfig(result.config)
    status.value = `官方样本云克隆成功：${result.voiceId}`
    tab.value = 'list'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '云克隆失败'
    status.value = ''
  } finally {
    busy.value = false
  }
}

async function onEnrollCustom(): Promise<void> {
  if (busy.value) return
  if (!hasApiKey.value) {
    error.value = '请先在聊天设置填写百炼 API Key'
    return
  }
  busy.value = true
  error.value = ''
  status.value = '请选择 WAV，并等待云克隆…'
  try {
    const result = await window.electronAPI?.enrollCustomTtsCloud?.({
      displayName: customName.value,
      referenceText: customTranscript.value
    })
    if (!result?.ok) {
      error.value = result?.detail || '自定义云克隆失败'
      status.value = ''
      return
    }
    applyConfig(result.config)
    status.value = `自定义云克隆成功：${result.voiceId}`
    tab.value = 'list'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '自定义云克隆失败'
    status.value = ''
  } finally {
    busy.value = false
  }
}

defineExpose({ reload })
</script>

<template>
  <section class="vf-cloud-panel">
    <p class="vf-cloud-panel__hint">
      云端链路对齐本地工坊：创造走设计→试听确认→预热；克隆可快速入库。API Key / 双模型在聊天设置。
    </p>
    <p class="vf-cloud-panel__meta">
      VC：{{ vcModel || '（未配置）' }} · VD：{{ vdModel || '（未配置）' }}
      <template v-if="!hasApiKey"> · 未配置 Key</template>
    </p>

    <div class="vf-cloud-panel__tabs" role="tablist">
      <button
        type="button"
        class="vf-cloud-panel__tab"
        :class="{ 'vf-cloud-panel__tab--active': tab === 'create' }"
        :disabled="busy"
        @click="tab = 'create'"
      >
        创造音色
      </button>
      <button
        type="button"
        class="vf-cloud-panel__tab"
        :class="{ 'vf-cloud-panel__tab--active': tab === 'list' }"
        :disabled="busy"
        @click="tab = 'list'"
      >
        我的音色
      </button>
      <button
        type="button"
        class="vf-cloud-panel__tab"
        :class="{ 'vf-cloud-panel__tab--active': tab === 'clone' }"
        :disabled="busy"
        @click="tab = 'clone'"
      >
        快速克隆
      </button>
      <button
        type="button"
        class="vf-cloud-panel__tab"
        :class="{ 'vf-cloud-panel__tab--active': tab === 'corpus' }"
        :disabled="busy"
        @click="tab = 'corpus'"
      >
        更新语料
      </button>
    </div>

    <div v-if="tab === 'create'" class="vf-cloud-panel__card">
      <VoiceForgeCloudCreateTab
        @voice-creation-started="emit('voice-creation-started')"
        @layout-change="emit('layout-change')"
        @error="error = $event"
      />
    </div>

    <div v-else-if="tab === 'list'" class="vf-cloud-panel__card">
      <h4 class="vf-cloud-panel__title">音色列表</h4>
      <p v-if="voices.length === 0" class="vf-cloud-panel__meta">还没有云端音色，请先创造或克隆。</p>
      <ul v-else class="vf-cloud-panel__list">
        <li v-for="row in voices" :key="row.id" class="vf-cloud-panel__row">
          <button
            type="button"
            class="vf-cloud-panel__row-main"
            :class="{ 'vf-cloud-panel__row-main--active': row.id === activeVoiceLocalId }"
            :disabled="busy"
            @click="setActive(row.id)"
          >
            <span class="vf-cloud-panel__row-name">{{ row.name }}</span>
            <span class="vf-cloud-panel__row-kind">{{ row.kind.toUpperCase() }}</span>
            <span class="vf-cloud-panel__row-id">{{ row.voiceId }}</span>
          </button>
          <button
            type="button"
            class="vf-cloud-panel__btn vf-cloud-panel__btn--danger"
            :disabled="busy"
            @click="onRemove(row.id)"
          >
            删除
          </button>
        </li>
      </ul>
    </div>

    <div v-else-if="tab === 'clone'" class="vf-cloud-panel__card">
      <h4 class="vf-cloud-panel__title">快速克隆（VC）</h4>
      <p class="vf-cloud-panel__meta">官方样本或 WAV 直接入库（不等同创造流程的审阅链）。完整体验请用「创造音色」。</p>
      <button type="button" class="vf-cloud-panel__btn" :disabled="busy" @click="onEnrollOfficial">
        官方样本云克隆
      </button>
      <hr class="vf-cloud-panel__hr" />
      <label class="vf-cloud-panel__label">自定义名称</label>
      <input v-model="customName" class="vf-cloud-panel__input" type="text" placeholder="留空则用文件名" :disabled="busy" />
      <label class="vf-cloud-panel__label">参考文本（可选）</label>
      <input
        v-model="customTranscript"
        class="vf-cloud-panel__input"
        type="text"
        placeholder="与 WAV 朗读内容一致更佳"
        :disabled="busy"
      />
      <button type="button" class="vf-cloud-panel__btn" :disabled="busy" @click="onEnrollCustom">
        选择 WAV 并云克隆
      </button>
    </div>

    <div v-else class="vf-cloud-panel__card">
      <VoiceForgeCloudCorpusTab
        :voices="voices"
        :active-local-id="activeVoiceLocalId"
        :has-api-key="hasApiKey"
        :disabled="busy"
        @status="status = $event"
        @error="error = $event"
        @config="applyConfig"
        @layout-change="emit('layout-change')"
      />
    </div>

    <p v-if="status" class="vf-cloud-panel__status">{{ status }}</p>
    <p v-if="error" class="vf-cloud-panel__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.vf-cloud-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vf-cloud-panel__hint,
.vf-cloud-panel__meta,
.vf-cloud-panel__status {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #9ca3af;
}

.vf-cloud-panel__status {
  color: #6b7280;
}

.vf-cloud-panel__error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}

.vf-cloud-panel__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vf-cloud-panel__tab {
  flex: 1;
  min-width: 72px;
  padding: 10px 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: #f3f4f6;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.vf-cloud-panel__tab--active {
  background: #fff;
  border-color: rgba(236, 72, 153, 0.35);
  color: #db2777;
  box-shadow: 0 1px 4px rgba(236, 72, 153, 0.12);
}

.vf-cloud-panel__tab:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vf-cloud-panel__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #f9a8d4;
  border-radius: 12px;
  background: #fff7fb;
}

.vf-cloud-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #9d174d;
}

.vf-cloud-panel__label {
  font-size: 12px;
  color: #6b7280;
}

.vf-cloud-panel__input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #fbcfe8;
  border-radius: 8px;
  font-size: 13px;
}

.vf-cloud-panel__btn {
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px solid #f9a8d4;
  border-radius: 10px;
  background: #fff;
  color: #9d174d;
  font-size: 13px;
  cursor: pointer;
}

.vf-cloud-panel__btn--danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.vf-cloud-panel__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vf-cloud-panel__hr {
  width: 100%;
  border: none;
  border-top: 1px solid #fbcfe8;
  margin: 4px 0;
}

.vf-cloud-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vf-cloud-panel__row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.vf-cloud-panel__row-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid #fbcfe8;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.vf-cloud-panel__row-main--active {
  border-color: #db2777;
  box-shadow: 0 0 0 1px rgba(219, 39, 119, 0.2);
}

.vf-cloud-panel__row-name {
  font-size: 13px;
  font-weight: 600;
  color: #831843;
}

.vf-cloud-panel__row-kind {
  font-size: 11px;
  color: #db2777;
}

.vf-cloud-panel__row-id {
  font-size: 11px;
  color: #6b7280;
  word-break: break-all;
}
</style>
