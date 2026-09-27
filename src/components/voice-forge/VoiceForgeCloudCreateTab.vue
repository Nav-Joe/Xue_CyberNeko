<script setup lang="ts">
import { ref } from 'vue'
import {
  CREATE_VOICE_CONFIRM,
  GENERATE_VOICE_LABEL,
  VOICE_NAME_PROMPT_HINT,
  VOICE_NAME_PROMPT_TITLE
} from '../../constants/voiceForge'
import { useVoiceCreationForm } from '../../composables/voice-forge/useVoiceCreationForm'
import { useVoiceCorpusEditor } from '../../composables/voice-forge/useVoiceCorpusEditor'
import { cloneCorpusPayload, getDefaultCorpusSnapshot } from '../../services/corpus'
import type { BodyPart } from '../../types/corpus'
import type { ForgeTab, VoiceSampleItem } from '../../composables/voice-forge/types'
import {
  CLOUD_VOICE_FORGE_START_EVENT,
  type CloudVoiceForgeStartDetail
} from '../../app/composables/useVoiceEventBus'
import VoiceForgeCreateTab from './tabs/VoiceForgeCreateTab.vue'

const emit = defineEmits<{
  'voice-creation-started': []
  'layout-change': []
  error: [message: string]
}>()

const creation = useVoiceCreationForm()
const activeTab = ref<ForgeTab>('create')
const voiceSamples = ref<VoiceSampleItem[]>([])
const editingSample = ref<VoiceSampleItem | undefined>(undefined)
const corpus = useVoiceCorpusEditor({
  activeTab,
  voiceSamples,
  editingSample
})

corpus.resetCreateCorpus(getDefaultCorpusSnapshot())

const showNameDialog = ref(false)
const applying = ref(false)

const { instruct, creationStatus, pendingSampleName, pendingValidatedCorpus, validateCreateEditor } =
  creation
const { createCorpus, addCreateLine, removeCreateLine } = corpus

function onGenerate(): void {
  const validated = validateCreateEditor(createCorpus)
  if (!validated.ok) {
    emit('error', validated.error)
    return
  }
  pendingValidatedCorpus.value = validated.data
  pendingSampleName.value = ''
  showNameDialog.value = true
  emit('layout-change')
}

function closeNameDialog(): void {
  showNameDialog.value = false
  pendingValidatedCorpus.value = null
}

async function confirmCreate(): Promise<void> {
  const name = pendingSampleName.value.trim()
  if (!name) {
    emit('error', '请填写声线名称')
    return
  }
  if (!pendingValidatedCorpus.value) {
    emit('error', '语料已失效，请重新生成')
    closeNameDialog()
    return
  }
  const ok =
    (await window.electronAPI?.showConfirmDialog?.({
      title: '创造云端音色',
      message:
        '将调用百炼声音设计生成音色，完成后请在弹窗中试听确认，再预热触摸语料。确定开始吗？'
    })) ?? window.confirm(CREATE_VOICE_CONFIRM)
  if (!ok) return

  const detail: CloudVoiceForgeStartDetail = {
    displayName: name,
    voicePrompt: instruct.value.trim(),
    corpus: cloneCorpusPayload(pendingValidatedCorpus.value)
  }
  applying.value = true
  creationStatus.value = '已开始云端声音设计。设置将关闭，桌宠窗口会显示进度；完成后请先试听再进入预热。'
  showNameDialog.value = false
  emit('voice-creation-started')
  window.dispatchEvent(new CustomEvent(CLOUD_VOICE_FORGE_START_EVENT, { detail }))
  applying.value = false
}

function onAddLine(part: BodyPart): void {
  addCreateLine(part)
  emit('layout-change')
}

function onRemoveLine(part: BodyPart, index: number): void {
  removeCreateLine(part, index)
  emit('layout-change')
}
</script>

<template>
  <div class="cloud-create">
    <p class="cloud-create__hint">
      与本地创造流程一致：填写声线描述与触摸语料 → 命名 → 云端设计 → 弹窗试听确认 → 预热落盘。
    </p>
    <VoiceForgeCreateTab
      :instruct="instruct"
      :create-corpus="createCorpus"
      :experimental-upload-enabled="false"
      :experimental-upload-saving="false"
      :show-experimental-upload="false"
      :applying="applying"
      :uploading-voice="false"
      :creation-status="creationStatus"
      @update:instruct="instruct = $event"
      @generate="onGenerate"
      @add-line="onAddLine"
      @remove-line="onRemoveLine"
    />

    <Teleport to="body">
      <div v-if="showNameDialog" class="name-mask" @click.self="closeNameDialog">
        <div class="name-card" role="dialog" aria-modal="true">
          <h3 class="name-title">{{ VOICE_NAME_PROMPT_TITLE }}</h3>
          <p class="name-hint">{{ VOICE_NAME_PROMPT_HINT }}</p>
          <input
            v-model="pendingSampleName"
            class="name-input"
            type="text"
            placeholder="例如：文静雪澜"
            maxlength="40"
            @keydown.enter.prevent="confirmCreate"
          />
          <div class="name-actions">
            <button type="button" class="name-btn" @click="closeNameDialog">取消</button>
            <button type="button" class="name-btn name-btn--primary" @click="confirmCreate">
              {{ GENERATE_VOICE_LABEL }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cloud-create__hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: #9ca3af;
}

.name-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
}

.name-card {
  width: min(360px, 92vw);
  padding: 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.name-title {
  margin: 0 0 6px;
  font-size: 15px;
  color: #831843;
}

.name-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #6b7280;
}

.name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #fbcfe8;
  border-radius: 8px;
  font-size: 13px;
}

.name-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.name-btn {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.name-btn--primary {
  border-color: #f9a8d4;
  color: #9d174d;
}
</style>
