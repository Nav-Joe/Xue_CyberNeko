<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import CloudVoicePickerDialog from './CloudVoicePickerDialog.vue'
import { notifyTtsCloudConfigChanged } from '../../services/ttsCloudSpeech'
import { playChatAudioBlob } from '../../services/ttsPlayer'
import './voice-action-buttons.css'

type VoiceRow = {
  id: string
  kind: 'vc' | 'vd'
  name: string
  voiceId: string
}

const voices = ref<VoiceRow[]>([])
const activeId = ref('')
const backend = ref<'local' | 'qwen'>('local')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const status = ref('')
const pickerOpen = ref(false)
const providers = ref<Array<{ id: string; label: string }>>([])
const seedVoices = ref<Array<{ id: string; name: string; speaker: string }>>([])
const edgeVoices = ref<Array<{ id: string; name: string; speaker: string }>>([])
const seedHasKey = ref(false)
const aliBaseUrl = ref('https://dashscope.aliyuncs.com')
const aliVcModel = ref('')
const aliVdModel = ref('')
const aliSecretSave = ref(false)
const aliHasKey = ref(false)
const aliApiKey = ref('')

const props = defineProps<{
  embedded?: boolean
}>()

let unbindHomeVisibility: (() => void) | null = null

function applyConfig(c: {
  ttsBackend: 'local' | 'qwen' | 'seed' | 'edge'
  qwen: {
    voices: VoiceRow[]
    activeVoiceLocalId: string
    baseUrl?: string
    vcModel?: string
    vdModel?: string
    secretSave?: boolean
    hasApiKey?: boolean
    apiKey?: string
  }
  seed?: {
    voices: Array<{ id: string; name: string; speaker: string }>
    activeVoiceLocalId: string
    hasApiKey: boolean
    resourceId?: string
  }
  edge?: {
    voices: Array<{ id: string; name: string; speaker: string }>
    activeVoiceLocalId: string
  }
}): void {
  voices.value = c.qwen.voices.map((v) => ({ ...v }))
  aliBaseUrl.value = c.qwen.baseUrl || aliBaseUrl.value
  aliVcModel.value = c.qwen.vcModel || ''
  aliVdModel.value = c.qwen.vdModel || ''
  aliSecretSave.value = c.qwen.secretSave === true
  aliHasKey.value = c.qwen.hasApiKey === true
  aliApiKey.value = c.qwen.secretSave ? '' : (c.qwen.apiKey ?? '')
  seedVoices.value = (c.seed?.voices ?? []).map((voice) => ({ ...voice }))
  edgeVoices.value = (c.edge?.voices ?? []).map((voice) => ({ ...voice }))
  seedHasKey.value = c.seed?.hasApiKey === true
  activeId.value =
    c.ttsBackend === 'seed'
      ? (c.seed?.activeVoiceLocalId ?? '')
      : c.ttsBackend === 'edge'
        ? (c.edge?.activeVoiceLocalId ?? '')
        : c.qwen.activeVoiceLocalId
  backend.value = c.ttsBackend === 'local' ? 'local' : 'qwen'
  notifyTtsCloudConfigChanged(c.ttsBackend === 'local' ? 'local' : c.ttsBackend)
}

async function reload(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [configResult, providerResult] = await Promise.all([
      window.electronAPI?.getTtsCloudConfig?.(),
      window.electronAPI?.listTtsCloudProviders?.()
    ])
    if (!configResult?.ok) {
      error.value = configResult?.detail || '加载云端音色失败'
      return
    }
    applyConfig(configResult.config)
    providers.value = providerResult?.ok ? providerResult.providers : [{ id: 'qwen', label: '阿里云' }]
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载云端音色失败'
  } finally {
    loading.value = false
  }
}

function currentVoiceName(): string {
  return (
    voices.value.find((row) => row.id === activeId.value)?.name ||
    seedVoices.value.find((row) => row.id === activeId.value)?.name ||
    edgeVoices.value.find((row) => row.id === activeId.value)?.name ||
    '未选择'
  )
}

function openPicker(): void {
  pickerOpen.value = true
  if (!loading.value) void reload()
}

defineExpose({ openPicker })

async function handleSwitch(providerId: string, localId: string): Promise<void> {
  if (busy.value || !providerId) return
  if (providerId === 'qwen' && localId === activeId.value && backend.value === 'qwen') return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const result = await window.electronAPI?.setTtsCloudConfig?.({
      ttsBackend: providerId === 'seed' ? 'seed' : providerId === 'edge' ? 'edge' : 'qwen',
      qwen: providerId === 'qwen' ? { activeVoiceLocalId: localId } : undefined,
      seed: providerId === 'seed' ? { activeVoiceLocalId: localId } : undefined,
      edge: providerId === 'edge' ? { activeVoiceLocalId: localId } : undefined
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

async function handleDelete(providerId: string, localId: string): Promise<void> {
  if (busy.value || !providerId) return
  const pool = providerId === 'seed' ? seedVoices.value : voices.value
  const row = pool.find((item) => item.id === localId)
  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: '删除云端声线',
        message: `确定删除「${row?.name ?? localId}」吗？`,
        confirmLabel: '确定删除'
      })
    : window.confirm(`确定删除「${row?.name ?? localId}」吗？`)
  if (!confirmed) return

  busy.value = true
  error.value = ''
  status.value = ''
  try {
    if (providerId === 'seed' || providerId === 'edge') {
      const source = providerId === 'seed' ? seedVoices.value : edgeVoices.value
      const result = await window.electronAPI?.setTtsCloudConfig?.({
        [providerId]: {
          voices: source.filter((item) => item.id !== localId).map((item) => ({
            ...item,
            createdAt: Date.now()
          }))
        }
      })
      if (!result?.ok) {
        error.value = result?.detail || '删除失败'
        return
      }
      applyConfig(result.config)
      status.value = providerId === 'edge' ? '已删除 Edge 声线' : '已删除 Seed 声线'
      return
    }
    const result = await window.electronAPI?.removeTtsCloudVoice?.({ localId })
    if (!result?.ok) {
      error.value = result?.detail || '删除失败'
      return
    }
    applyConfig(result.config)
    status.value = result.remoteDeleted ? '已删除本地与云端音色' : '已从本机列表删除'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    busy.value = false
  }
}

async function saveSeed(payload: { apiKey: string; resourceId: string; speaker: string; name: string }): Promise<void> {
  if (!payload.speaker) return
  busy.value = true
  error.value = ''
  try {
    const id = `seed${Date.now().toString(36)}`
    const voices = [
      ...seedVoices.value.map((voice) => ({ ...voice, createdAt: Date.now() })),
      {
        id,
        name: payload.name || payload.speaker,
        speaker: payload.speaker,
        createdAt: Date.now()
      }
    ]
    const result = await window.electronAPI?.setTtsCloudConfig?.({
      ttsBackend: 'seed',
      seed: {
        resourceId: payload.resourceId,
        voices,
        activeVoiceLocalId: id,
        ...(payload.apiKey ? { apiKey: payload.apiKey } : {})
      }
    })
    if (!result?.ok) {
      error.value = result?.detail || '保存 Seed 声线失败'
      return
    }
    applyConfig(result.config)
    status.value = '已添加 Seed 声线'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存 Seed 声线失败'
  } finally {
    busy.value = false
  }
}

async function saveEdge(payload: { speaker: string; name: string }): Promise<void> {
  if (!payload.speaker) return
  busy.value = true
  error.value = ''
  try {
    const id = `edge${Date.now().toString(36)}`
    const voices = [
      ...edgeVoices.value.map((voice) => ({ ...voice, createdAt: voice.createdAt || Date.now() })),
      { id, name: payload.name || payload.speaker, speaker: payload.speaker, createdAt: Date.now() }
    ]
    const result = await window.electronAPI?.setTtsCloudConfig?.({
      ttsBackend: 'edge',
      edge: { voices, activeVoiceLocalId: id }
    })
    if (!result?.ok) {
      error.value = result?.detail || '保存 Edge 声线失败'
      return
    }
    applyConfig(result.config)
    status.value = '已添加 Edge 声线'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存 Edge 声线失败'
  } finally {
    busy.value = false
  }
}

async function saveAli(payload: {
  baseUrl: string
  vcModel: string
  vdModel: string
  secretSave: boolean
  apiKey: string
}): Promise<boolean> {
  busy.value = true
  error.value = ''
  try {
    const typedKey = payload.apiKey.trim()
    const qwen: {
      baseUrl: string
      vcModel: string
      vdModel: string
      secretSave: boolean
      apiKey?: string
    } = {
      baseUrl: payload.baseUrl,
      vcModel: payload.vcModel,
      vdModel: payload.vdModel,
      secretSave: payload.secretSave
    }
    if (typedKey) {
      qwen.apiKey = typedKey
    } else if (aliApiKey.value.trim()) {
      // 密钥曾显示在输入框里，用户删空才表示清除。私密保存时框是空的，不能据此覆盖。
      qwen.apiKey = ''
    }
    const result = await window.electronAPI?.setTtsCloudConfig?.({ qwen })
    if (!result?.ok) {
      error.value = result?.detail || '保存阿里云配置失败'
      return false
    }
    applyConfig(result.config)
    status.value = '阿里云配置已保存'
    return true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存阿里云配置失败'
    return false
  } finally {
    busy.value = false
  }
}

async function previewAli(payload: {
  baseUrl: string
  vcModel: string
  vdModel: string
  secretSave: boolean
  apiKey: string
  text: string
}): Promise<void> {
  const saved = await saveAli(payload)
  if (!saved) return
  busy.value = true
  error.value = ''
  try {
    const result = await window.electronAPI?.previewTtsCloud?.({ text: payload.text })
    if (!result?.ok) {
      error.value = result?.detail || '试听失败'
      return
    }
    await playChatAudioBlob(new Blob([result.audio], { type: result.mime || 'audio/mpeg' }))
    status.value = '试听完成'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '试听失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void reload()
  unbindHomeVisibility =
    window.electronAPI?.onHomeVisibilityChanged?.((visible) => {
      if (visible) void reload()
    }) ?? null
})

onUnmounted(() => {
  unbindHomeVisibility?.()
})
</script>

<template>
  <section class="voice-switcher cloud-voices" :class="{ 'cloud-voices--embedded': props.embedded }">
    <template v-if="!props.embedded">
      <h2 class="title">云端声线</h2>
      <p class="hint">
        创造与克隆仍在音色工坊。这里切换当前云端音色、删除不用的条目。
        <template v-if="backend === 'local'">对话若还走本地引擎，切这里只改云端列表里的「当前」项。</template>
      </p>
    </template>
    <p v-else class="hint">创造与克隆在音色工坊。点「挑选声线」选择云服务和声线。</p>

    <p v-if="loading" class="status">加载中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>
    <p v-else class="status">
      当前：{{ currentVoiceName() }}
    </p>
    <button type="button" class="voice-action" :disabled="loading" @click="openPicker">挑选声线</button>
    <p v-if="status" class="status">{{ status }}</p>

    <CloudVoicePickerDialog
      :open="pickerOpen"
      :providers="providers"
      :voices-by-provider="{ qwen: voices, seed: seedVoices, edge: edgeVoices }"
      :active-id="activeId"
      :busy="busy"
      :seed-has-key="seedHasKey"
      :ali-base-url="aliBaseUrl"
      :ali-vc-model="aliVcModel"
      :ali-vd-model="aliVdModel"
      :ali-secret-save="aliSecretSave"
      :ali-has-key="aliHasKey"
      :ali-api-key="aliApiKey"
      @close="pickerOpen = false"
      @switch="handleSwitch"
      @delete="handleDelete"
      @save-seed="saveSeed"
      @save-edge="saveEdge"
      @save-ali="saveAli"
      @preview-ali="previewAli"
    />
  </section>
</template>

<style scoped>
.cloud-voices--embedded {
  margin: 0;
}

.title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
}

.hint,
.status {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
}

.status.error {
  color: var(--home-color-danger, #b91c1c);
}
</style>
