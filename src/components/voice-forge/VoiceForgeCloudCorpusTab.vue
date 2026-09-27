<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import {
  CORPUS_EDITING_LABEL,
  CORPUS_PER_SAMPLE_HINT,
  CORPUS_PREWARM_CONFIRM,
  CORPUS_PREWARM_HINT,
  CORPUS_UNSAVED_SWITCH_CONFIRM,
  SAVE_AND_PREWARM_LABEL,
  VOICE_FORGE_UPDATE_INTRO
} from '../../constants/voiceForge'
import {
  cloneCorpusPayload,
  emptyCorpus,
  getDefaultCorpusSnapshot,
  setRuntimeCorpus
} from '../../services/corpus'
import { setTouchFeedbackMode } from '../../services/touchModeSettings'
import type { BodyPart, CorpusData } from '../../types/corpus'
import VoiceForgeCorpusEditor from './VoiceForgeCorpusEditor.vue'

type VoiceRow = {
  id: string
  kind: 'vc' | 'vd'
  name: string
  voiceId: string
  createdAt: number
}

type ConfigView = {
  ttsBackend: 'local' | 'qwen'
  qwen: {
    voices: VoiceRow[]
    activeVoiceLocalId: string
    vcModel: string
    vdModel: string
    hasApiKey: boolean
  }
}

const props = defineProps<{
  voices: VoiceRow[]
  activeLocalId: string
  hasApiKey: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  status: [message: string]
  error: [message: string]
  config: [config: ConfigView]
  'layout-change': []
}>()

const editingLocalId = ref('')
const corpus = ref<CorpusData>(emptyCorpus())
const baselineCorpus = ref<CorpusData>(emptyCorpus())
const loading = ref(false)
const prewarming = ref(false)

const editingVoice = computed(() => props.voices.find((v) => v.id === editingLocalId.value))
const editingLabel = computed(() => editingVoice.value?.name || '未选择')
const isDirty = computed(
  () => JSON.stringify(corpus.value) !== JSON.stringify(baselineCorpus.value)
)

function ensureEditingSelection(): void {
  if (props.voices.length === 0) {
    editingLocalId.value = ''
    return
  }
  if (editingLocalId.value && props.voices.some((v) => v.id === editingLocalId.value)) {
    return
  }
  const preferred =
    props.activeLocalId && props.voices.some((v) => v.id === props.activeLocalId)
      ? props.activeLocalId
      : props.voices[0].id
  editingLocalId.value = preferred
}

async function loadCorpus(localId: string): Promise<void> {
  if (!localId) {
    corpus.value = getDefaultCorpusSnapshot()
    baselineCorpus.value = cloneCorpusPayload(corpus.value)
    return
  }
  loading.value = true
  try {
    const result = await window.electronAPI?.getTtsCloudCorpus?.({ localId })
    if (!result?.ok) {
      corpus.value = getDefaultCorpusSnapshot()
    } else {
      corpus.value = cloneCorpusPayload(result.corpus)
    }
    baselineCorpus.value = cloneCorpusPayload(corpus.value)
  } catch {
    corpus.value = getDefaultCorpusSnapshot()
    baselineCorpus.value = cloneCorpusPayload(corpus.value)
  } finally {
    loading.value = false
    emit('layout-change')
  }
}

async function onSelectVoice(nextId: string): Promise<void> {
  if (nextId === editingLocalId.value) return
  if (isDirty.value) {
    const ok =
      (await window.electronAPI?.showConfirmDialog?.({
        title: '未保存的语料',
        message: CORPUS_UNSAVED_SWITCH_CONFIRM
      })) ?? window.confirm(CORPUS_UNSAVED_SWITCH_CONFIRM)
    if (!ok) return
  }
  editingLocalId.value = nextId
}

function addLine(part: BodyPart): void {
  corpus.value[part].push('')
  emit('layout-change')
}

function removeLine(part: BodyPart, index: number): void {
  corpus.value[part].splice(index, 1)
  emit('layout-change')
}

async function onPrewarm(): Promise<void> {
  if (prewarming.value || props.disabled) return
  const target = editingVoice.value
  if (!target) {
    emit('error', '请先选择要更新的云端音色')
    return
  }
  if (!props.hasApiKey) {
    emit('error', '请先在聊天设置填写百炼 API Key')
    return
  }
  const ok =
    (await window.electronAPI?.showConfirmDialog?.({
      title: SAVE_AND_PREWARM_LABEL,
      message: CORPUS_PREWARM_CONFIRM.replace('{name}', target.name),
      confirmLabel: '开始预热'
    })) ?? window.confirm(CORPUS_PREWARM_CONFIRM.replace('{name}', target.name))
  if (!ok) return

  prewarming.value = true
  emit('error', '')
  emit('status', `正在用「${target.name}」合成并写入云端触摸缓存…`)
  try {
    const result = await window.electronAPI?.prewarmTtsCloudCorpus?.({
      corpus: cloneCorpusPayload(corpus.value),
      localId: target.id
    })
    if (!result?.ok) {
      emit('error', result?.detail || '云端语料预热失败')
      emit('status', '')
      return
    }
    corpus.value = cloneCorpusPayload(result.corpus)
    baselineCorpus.value = cloneCorpusPayload(result.corpus)
    setRuntimeCorpus(cloneCorpusPayload(result.corpus))
    setTouchFeedbackMode(result.touchMode)
    emit('config', result.config)
    if (result.failures.length) {
      console.warn('[tts-cloud] prewarm failures', result.failures)
    }
    const failHint =
      result.failed > 0 ? `；失败 ${result.failed} 句（详见控制台）` : ''
    emit(
      'status',
      `「${target.name}」预热完成：新合成 ${result.synthesized}，跳过 ${result.skipped}，共 ${result.total} 句${failHint}`
    )
  } catch (err) {
    emit('error', err instanceof Error ? err.message : '云端语料预热失败')
    emit('status', '')
  } finally {
    prewarming.value = false
  }
}

watch(
  () => props.voices.map((v) => v.id).join('|'),
  () => {
    ensureEditingSelection()
  },
  { immediate: true }
)

watch(editingLocalId, (id) => {
  void loadCorpus(id)
})

onMounted(() => {
  ensureEditingSelection()
  if (editingLocalId.value) void loadCorpus(editingLocalId.value)
})

defineExpose({ reload: () => loadCorpus(editingLocalId.value) })
</script>

<template>
  <div class="vf-cloud-corpus">
    <p class="vf-cloud-corpus__intro">{{ VOICE_FORGE_UPDATE_INTRO }}</p>

    <div class="vf-cloud-corpus__head">
      <h4 class="vf-cloud-corpus__title">触摸台词</h4>
      <label class="vf-cloud-corpus__picker">
        <span class="vf-cloud-corpus__picker-label">{{ CORPUS_EDITING_LABEL }}</span>
        <select
          class="vf-cloud-corpus__select"
          :value="editingLocalId"
          :disabled="disabled || prewarming || loading || voices.length === 0"
          @change="onSelectVoice(($event.target as HTMLSelectElement).value)"
        >
          <option v-if="voices.length === 0" value="">暂无可选云端音色</option>
          <option v-for="row in voices" :key="row.id" :value="row.id">
            {{ row.name }}（{{ row.kind.toUpperCase() }}）
            {{ row.id === activeLocalId ? ' · 当前' : '' }}
          </option>
        </select>
      </label>
    </div>

    <p class="vf-cloud-corpus__hint">{{ CORPUS_PER_SAMPLE_HINT }}</p>
    <p class="vf-cloud-corpus__hint">
      保存并预热会调用该音色绑定的百炼 voice 合成，每句 1 条 wav 写入其独立云缓存目录。
    </p>
    <p v-if="voices.length === 0" class="vf-cloud-corpus__hint">请先创造或克隆一条云端音色。</p>
    <p v-else-if="loading" class="vf-cloud-corpus__hint">正在加载「{{ editingLabel }}」的语料…</p>

    <template v-else-if="editingLocalId">
      <VoiceForgeCorpusEditor
        key-prefix="cloud-update"
        :corpus="corpus"
        :disabled="disabled || prewarming || loading"
        @add-line="addLine"
        @remove-line="removeLine"
      />
      <p class="vf-cloud-corpus__hint">{{ CORPUS_PREWARM_HINT }}</p>
      <button
        type="button"
        class="vf-cloud-corpus__btn"
        :disabled="disabled || prewarming || loading || !editingLocalId"
        @click="onPrewarm"
      >
        {{ prewarming ? '处理中…' : SAVE_AND_PREWARM_LABEL }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.vf-cloud-corpus {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vf-cloud-corpus__intro,
.vf-cloud-corpus__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #9ca3af;
}

.vf-cloud-corpus__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.vf-cloud-corpus__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #9d174d;
}

.vf-cloud-corpus__picker {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.vf-cloud-corpus__picker-label {
  font-size: 11px;
  color: #6b7280;
}

.vf-cloud-corpus__select {
  min-width: 148px;
  max-width: 200px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #fbcfe8;
  background: #fff;
  font-size: 12px;
  color: #831843;
}

.vf-cloud-corpus__btn {
  width: 100%;
  margin-top: 4px;
  padding: 11px 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #ec4899, #f472b6);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.vf-cloud-corpus__btn:disabled {
  opacity: 0.65;
  cursor: wait;
}
</style>
