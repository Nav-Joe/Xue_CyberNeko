<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { notifyTtsCloudConfigChanged } from '../../services/ttsCloudSpeech'
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

const props = defineProps<{
  embedded?: boolean
}>()

let unbindHomeVisibility: (() => void) | null = null

function kindLabel(kind: VoiceRow['kind']): string {
  return kind === 'vd' ? '云设计' : '云克隆'
}

function applyConfig(c: {
  ttsBackend: 'local' | 'qwen'
  qwen: { voices: VoiceRow[]; activeVoiceLocalId: string }
}): void {
  voices.value = c.qwen.voices.map((v) => ({ ...v }))
  activeId.value = c.qwen.activeVoiceLocalId
  backend.value = c.ttsBackend
  notifyTtsCloudConfigChanged(c.ttsBackend)
}

async function reload(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await window.electronAPI?.getTtsCloudConfig?.()
    if (!result?.ok) {
      error.value = result?.detail || '加载云端音色失败'
      return
    }
    applyConfig(result.config)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载云端音色失败'
  } finally {
    loading.value = false
  }
}

async function handleSwitch(localId: string): Promise<void> {
  if (busy.value || localId === activeId.value) return
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

async function handleDelete(localId: string): Promise<void> {
  if (busy.value) return
  const row = voices.value.find((v) => v.id === localId)
  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: '删除云端声线',
        message: `确定删除「${row?.name ?? localId}」吗？会尽量同时从云端账号删除；失败时仍会从本机列表移除。`,
        confirmLabel: '确定删除'
      })
    : window.confirm(`确定删除「${row?.name ?? localId}」吗？`)
  if (!confirmed) return

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
    status.value = result.remoteDeleted ? '已删除本地与云端音色' : '已从本机列表删除'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
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
    <p v-else class="hint">
      创造与克隆在音色工坊。
      <template v-if="backend === 'local'">当前对话若走本地引擎，这里只改云端列表的当前项。</template>
    </p>

    <p v-if="loading" class="status">加载中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>
    <p v-else-if="voices.length === 0" class="status">还没有云端声线，请先在音色工坊创造或克隆。</p>
    <ul v-else class="sample-list">
      <li v-for="row in voices" :key="row.id" class="sample-item">
        <div class="sample-body">
          <span class="sample-name">{{ row.name }}</span>
          <span class="sample-meta">{{ kindLabel(row.kind) }}</span>
          <span v-if="row.id === activeId" class="sample-active">当前使用</span>
        </div>
        <div class="sample-actions">
          <button
            type="button"
            class="voice-action"
            :disabled="busy || row.id === activeId"
            @click="handleSwitch(row.id)"
          >
            {{ row.id === activeId ? '使用中' : '切换' }}
          </button>
          <button
            type="button"
            class="voice-action voice-action--danger"
            :disabled="busy"
            @click="handleDelete(row.id)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
    <p v-if="status" class="status">{{ status }}</p>
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

.sample-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sample-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--home-line, rgba(63, 42, 51, 0.12));
}

.sample-body {
  flex: 1;
  min-width: 0;
}

.sample-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.sample-meta,
.sample-active {
  display: block;
  margin-top: 2px;
  font-size: 11px;
}

.sample-active {
  color: var(--home-color-success, #166534);
  font-weight: 600;
}

.sample-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
</style>
