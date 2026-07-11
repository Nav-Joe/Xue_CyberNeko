<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { CORPUS_UNSAVED_SWITCH_CONFIRM, CREATE_VOICE_STARTED_HINT, UPLOAD_VOICE_STARTED_HINT, VOICE_FORGE_HOME_HINT } from '../constants/voiceForge'
import { useVoiceCorpusEditor } from '../composables/voice-forge/useVoiceCorpusEditor'
import { useVoiceCreationForm } from '../composables/voice-forge/useVoiceCreationForm'
import {
  useVoiceForgeOrchestrator,
  type CreateSubmitPayload,
  type PrewarmPayload,
  type UploadStartPayload
} from '../composables/voice-forge/useVoiceForgeOrchestrator'
import type { VoiceForgeConfirmOpts } from '../composables/voice-forge/types'
import { useVoiceForgeWorkbench } from '../composables/voice-forge/useVoiceForgeWorkbench'
import { useVoiceUploadWizard } from '../composables/voice-forge/useVoiceUploadWizard'
import { cloneCorpusPayload, getDefaultCorpusSnapshot, setRuntimeCorpus } from '../services/corpus'
import { notifyVoiceUploadReady, resumeVoiceForgeCreation } from '../services/voiceForgeApi'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import { setVoiceUploadFlowGuard } from '../services/voiceUploadFlowGuard'
import VoiceForgeDialogs from './voice-forge/VoiceForgeDialogs.vue'
import VoiceForgeTabBar from './voice-forge/VoiceForgeTabBar.vue'
import VoiceForgeCreateTab from './voice-forge/tabs/VoiceForgeCreateTab.vue'
import VoiceForgeUpdateTab from './voice-forge/tabs/VoiceForgeUpdateTab.vue'

const emit = defineEmits<{
  'layout-change': []
  'voice-creation-started': []
  'upload-flow-active': [active: boolean]
}>()

const workbench = useVoiceForgeWorkbench()
const creation = useVoiceCreationForm()
const corpus = useVoiceCorpusEditor({
  activeTab: workbench.activeTab,
  voiceSamples: workbench.voiceSamples,
  editingSample: workbench.editingSample
})
const upload = useVoiceUploadWizard()

const {
  activeTab, voiceSamples, editingSampleId, activeSampleFolderId, loadingSampleCorpus,
  applying, applyingCorpus, parseError, experimentalUploadEnabled, experimentalUploadSaving, editingSampleLabel
} = workbench
const { instruct, creationStatus, pendingSampleName } = creation
const {
  updateCorpus, createCorpus, canApplyCorpusPrewarm, corpusPrewarmDisabledReason,
  setUpdateCorpus, clearUpdateCorpus, markUpdateSaved, resetCreateCorpus,
  addUpdateLine, removeUpdateLine, addCreateLine, removeCreateLine, updateCorpusChanged
} = corpus
const {
  uploadAgreementChecked, uploadAgreementSecondsLeft, uploadReferenceText, uploadWavFileName,
  pendingUploadName, uploadCorpus, uploadingVoice, addUploadLine, removeUploadLine
} = upload

async function confirmDialog(opts: VoiceForgeConfirmOpts): Promise<boolean> {
  return window.electronAPI?.showConfirmDialog?.(opts) ?? window.confirm(opts.message)
}

async function pickUploadWav(): Promise<{ fileName: string } | null> {
  if (!window.electronAPI?.pickVoiceUploadWav) throw new Error('当前环境不支持选择 WAV 文件')
  return window.electronAPI.pickVoiceUploadWav()
}

async function loadVoiceSamples(preferredFolderId?: string | null): Promise<void> {
  if (!window.electronAPI?.listVoiceSamples) {
    voiceSamples.value = []
    return
  }
  voiceSamples.value = await window.electronAPI.listVoiceSamples()
  workbench.resolveEditingSampleId(preferredFolderId)
}

async function handleCreateSubmit(payload: CreateSubmitPayload): Promise<void> {
  if (!window.electronAPI?.prepareVoiceCreation) throw new Error('当前环境不支持创建声线流程')
  const corpusPayload = cloneCorpusPayload(payload.corpus)
  const profile = await window.electronAPI.prepareVoiceCreation('custom_corpus', corpusPayload, payload.instruct, payload.displayName)
  const resumed = await resumeVoiceForgeCreation()
  if (!resumed.ok) throw new Error(`配置已保存，但 TTS 未能开始生成：${resumed.detail ?? '未知错误'}。请确认 TTS 窗口正在运行。`)
  setTouchFeedbackMode('custom_corpus')
  setRuntimeCorpus(corpusPayload)
  creationStatus.value = CREATE_VOICE_STARTED_HINT
  activeSampleFolderId.value = profile.folderId
  await loadVoiceSamples(profile.folderId)
  window.dispatchEvent(new CustomEvent('voice-forge-boot'))
  emit('voice-creation-started')
}

async function handleUploadStart(payload: UploadStartPayload): Promise<void> {
  if (!window.electronAPI?.prepareVoiceUpload) throw new Error('当前环境不支持上传声线')
  const corpusPayload = cloneCorpusPayload(payload.corpus)
  const profile = await window.electronAPI.prepareVoiceUpload({
    displayName: payload.displayName, corpus: corpusPayload, referenceText: payload.referenceText
  })
  const notified = await notifyVoiceUploadReady()
  if (!notified.ok) throw new Error(`参考音已保存，但 TTS 未能进入试听：${notified.detail ?? '未知错误'}`)
  setTouchFeedbackMode('custom_corpus')
  setRuntimeCorpus(corpusPayload)
  creationStatus.value = UPLOAD_VOICE_STARTED_HINT
  activeSampleFolderId.value = profile.folderId
  await loadVoiceSamples(profile.folderId)
  window.dispatchEvent(new CustomEvent('voice-upload-review'))
  emit('voice-creation-started')
}

async function handlePrewarm(payload: PrewarmPayload): Promise<void> {
  if (!window.electronAPI?.applyCorpusPrewarm) throw new Error('当前环境不支持语料预热')
  const corpusPayload = cloneCorpusPayload(payload.corpus)
  const profile = await window.electronAPI.applyCorpusPrewarm(payload.folderId, corpusPayload)
  if (!profile.runtimeUnchanged) {
    activeSampleFolderId.value = profile.folderId
    setTouchFeedbackMode('custom_corpus')
    setRuntimeCorpus(corpusPayload)
  }
  markUpdateSaved(corpusPayload)
  window.dispatchEvent(new CustomEvent('pet-settings-close'))
  if (!window.electronAPI?.beginVoiceEngineLoad) throw new Error('当前环境不支持语音引擎加载')
  const loadResult = await window.electronAPI.beginVoiceEngineLoad({
    title: '更新语料库', message: '正在预热语料库喵~', mode: 'prewarm', expectedTouchMode: profile.touchMode
  })
  if (!loadResult.ok) throw new Error('TTS 未能完成语料预热，请确认 TTS 窗口正在运行')
  emit('voice-creation-started')
}

const orch = useVoiceForgeOrchestrator({
  workbench, creation, corpus, upload,
  setParseError: (message) => { parseError.value = message },
  clearParseError: () => { parseError.value = '' },
  confirm: confirmDialog, pickUploadWav,
  onCreateSubmit: handleCreateSubmit, onUploadStart: handleUploadStart, onPrewarm: handlePrewarm,
  onUploadFlowBegin: () => setVoiceUploadFlowGuard(true),
  onUploadFlowReset: () => { setVoiceUploadFlowGuard(false); void window.electronAPI?.cancelVoiceUploadStaging?.() }
})

const {
  showNameDialog, showUploadRiskDialog, showUploadAgreement, showUploadTranscriptDialog,
  showUploadTranscriptConfirmDialog, showUploadCorpusDialog, showUploadNameDialog,
  isUploadFlowActive, showUploadFlowBackdrop,
  onApplyAndRelaunch, closeNameDialog, onConfirmCreate, onBeginVoiceUploadFlow, resetUploadFlow,
  onConfirmUploadRisk, onContinueUploadAfterAgreement, onContinueUploadAfterTranscript,
  backToTranscriptStep, openCorpusStep, backToTranscriptConfirmStep, onContinueUploadAfterCorpus,
  onConfirmUploadImport, onApplyCorpusPrewarm, agreementWaitText
} = orch

const showParseError = computed(() => parseError.value && !isUploadFlowActive.value)

async function loadCorpusForEditingSample(folderId: string): Promise<void> {
  if (!folderId) return clearUpdateCorpus()
  loadingSampleCorpus.value = true
  try {
    const data = window.electronAPI?.readSampleCorpus
      ? ((await window.electronAPI.readSampleCorpus(folderId)) as import('../types/corpus').CorpusData)
      : getDefaultCorpusSnapshot()
    setUpdateCorpus(data)
  } finally {
    loadingSampleCorpus.value = false
  }
}

async function loadEditorState(): Promise<void> {
  try {
    if (window.electronAPI?.readVoiceForgeConfig) {
      const config = await window.electronAPI.readVoiceForgeConfig()
      activeSampleFolderId.value = config.activeSample?.folderId ?? null
      instruct.value = config.instruct
      if (window.electronAPI.readExperimentalVoiceUpload) {
        experimentalUploadEnabled.value = (await window.electronAPI.readExperimentalVoiceUpload()).enabled
      }
      await loadVoiceSamples(config.activeSample?.folderId)
      if (editingSampleId.value) await loadCorpusForEditingSample(editingSampleId.value)
      resetCreateCorpus(getDefaultCorpusSnapshot())
      return
    }
    if (window.electronAPI?.readTouchConfig) {
      setUpdateCorpus((await window.electronAPI.readTouchConfig()).corpus as import('../types/corpus').CorpusData)
      resetCreateCorpus(getDefaultCorpusSnapshot())
      await loadVoiceSamples()
      return
    }
  } catch (error) {
    console.warn('[VoiceForge] 读取配置失败，使用内置语料', error)
  }
  setUpdateCorpus(getDefaultCorpusSnapshot())
  resetCreateCorpus(getDefaultCorpusSnapshot())
  await loadVoiceSamples()
}

async function onEditingSampleChange(nextId: string, previousId: string): Promise<void> {
  if (nextId === previousId || loadingSampleCorpus.value) return
  if (updateCorpusChanged.value) {
    const ok = window.electronAPI?.showConfirmDialog
      ? await window.electronAPI.showConfirmDialog({ title: '未保存的语料', message: CORPUS_UNSAVED_SWITCH_CONFIRM, confirmLabel: '继续切换' })
      : window.confirm(CORPUS_UNSAVED_SWITCH_CONFIRM)
    if (!ok) return void (editingSampleId.value = previousId)
  }
  await loadCorpusForEditingSample(nextId)
}

async function onExperimentalUploadToggle(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const next = target.checked
  experimentalUploadSaving.value = true
  try {
    if (!window.electronAPI?.setExperimentalVoiceUpload) throw new Error('当前环境不支持实验功能开关')
    experimentalUploadEnabled.value = (await window.electronAPI.setExperimentalVoiceUpload(next)).enabled
  } catch (error) {
    target.checked = !next
    parseError.value = error instanceof Error ? error.message : '无法保存实验开关'
  } finally {
    experimentalUploadSaving.value = false
  }
}

watch(editingSampleId, (n, p) => { void onEditingSampleChange(n, p) })
watch(activeTab, () => { parseError.value = ''; void nextTick(() => emit('layout-change')) })
watch(isUploadFlowActive, (active) => emit('upload-flow-active', active), { immediate: true })
watch([updateCorpus, createCorpus, activeTab], () => { void nextTick(() => emit('layout-change')) }, { deep: true })
onMounted(() => { void loadEditorState() })
onUnmounted(() => resetUploadFlow())
</script>

<template>
  <div class="voice-forge" :class="{ 'voice-forge--upload-flow': isUploadFlowActive }">
    <div v-show="!isUploadFlowActive" class="voice-forge__main">
      <p class="home-hint">{{ VOICE_FORGE_HOME_HINT }}</p>
      <VoiceForgeTabBar :active-tab="activeTab" @update:active-tab="activeTab = $event" />
      <VoiceForgeUpdateTab
        v-if="activeTab === 'update'"
        :voice-samples="voiceSamples"
        :editing-sample-id="editingSampleId"
        :editing-sample-label="editingSampleLabel"
        :loading-sample-corpus="loadingSampleCorpus"
        :applying="applying"
        :applying-corpus="applyingCorpus"
        :update-corpus="updateCorpus"
        :can-apply-corpus-prewarm="canApplyCorpusPrewarm"
        :corpus-prewarm-disabled-reason="corpusPrewarmDisabledReason"
        @update:editing-sample-id="editingSampleId = $event"
        @prewarm="onApplyCorpusPrewarm"
        @add-line="addUpdateLine"
        @remove-line="removeUpdateLine"
      />
      <VoiceForgeCreateTab
        v-else
        :instruct="instruct"
        :create-corpus="createCorpus"
        :experimental-upload-enabled="experimentalUploadEnabled"
        :experimental-upload-saving="experimentalUploadSaving"
        :applying="applying"
        :uploading-voice="uploadingVoice"
        :creation-status="creationStatus"
        @update:instruct="instruct = $event"
        @generate="onApplyAndRelaunch"
        @toggle-experimental="onExperimentalUploadToggle"
        @start-upload="onBeginVoiceUploadFlow"
        @add-line="addCreateLine"
        @remove-line="removeCreateLine"
      />
      <p v-if="showParseError" class="status error">{{ parseError }}</p>
    </div>

    <VoiceForgeDialogs
      :show-upload-flow-backdrop="showUploadFlowBackdrop"
      :show-upload-risk-dialog="showUploadRiskDialog"
      :show-upload-agreement="showUploadAgreement"
      :show-upload-transcript-dialog="showUploadTranscriptDialog"
      :show-upload-transcript-confirm-dialog="showUploadTranscriptConfirmDialog"
      :show-upload-corpus-dialog="showUploadCorpusDialog"
      :show-upload-name-dialog="showUploadNameDialog"
      :show-name-dialog="showNameDialog"
      :is-upload-flow-active="isUploadFlowActive"
      :parse-error="parseError"
      :upload-agreement-checked="uploadAgreementChecked"
      :upload-agreement-seconds-left="uploadAgreementSecondsLeft"
      :upload-reference-text="uploadReferenceText"
      :upload-wav-file-name="uploadWavFileName"
      :pending-upload-name="pendingUploadName"
      :pending-sample-name="pendingSampleName"
      :upload-corpus="uploadCorpus"
      :agreement-wait-text="agreementWaitText()"
      @update:upload-agreement-checked="uploadAgreementChecked = $event"
      @update:upload-reference-text="uploadReferenceText = $event"
      @update:pending-upload-name="pendingUploadName = $event"
      @update:pending-sample-name="pendingSampleName = $event"
      @reset-upload-flow="resetUploadFlow"
      @confirm-upload-risk="onConfirmUploadRisk"
      @continue-after-agreement="onContinueUploadAfterAgreement"
      @continue-after-transcript="onContinueUploadAfterTranscript"
      @back-to-transcript="backToTranscriptStep"
      @open-corpus="openCorpusStep"
      @back-to-transcript-confirm="backToTranscriptConfirmStep"
      @continue-after-corpus="onContinueUploadAfterCorpus"
      @confirm-upload-import="onConfirmUploadImport"
      @close-name-dialog="closeNameDialog"
      @confirm-create="onConfirmCreate"
      @add-upload-line="addUploadLine"
      @remove-upload-line="removeUploadLine"
    />
  </div>
</template>

<style scoped>
.voice-forge { display: flex; flex-direction: column; gap: 10px; }
.home-hint { margin: 0; font-size: 12px; line-height: 1.55; color: #9ca3af; }
.voice-forge--upload-flow { min-height: 0; }
.status.error { margin: 0; font-size: 12px; line-height: 1.5; color: #dc2626; }
</style>
