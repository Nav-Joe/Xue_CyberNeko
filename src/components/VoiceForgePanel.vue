<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  BODY_PART_HINTS,
  BODY_PART_LABELS,
  BODY_PART_ORDER,
  CORPUS_EDITING_LABEL,
  CORPUS_PER_SAMPLE_HINT,
  CORPUS_PREWARM_CONFIRM,
  CORPUS_PREWARM_HINT,
  CORPUS_PREWARM_UNCHANGED_HINT,
  CORPUS_UNSAVED_SWITCH_CONFIRM,
  CREATE_VOICE_CONFIRM,
  CREATE_VOICE_STARTED_HINT,
  EXPERIMENTAL_UPLOAD_HINT,
  EXPERIMENTAL_UPLOAD_LABEL,
  EXPERIMENTAL_UPLOAD_WARNING,
  GENERATE_VOICE_LABEL,
  SAVE_AND_PREWARM_LABEL,
  UPLOAD_AGREEMENT_BODY,
  UPLOAD_AGREEMENT_CHECKBOX,
  UPLOAD_AGREEMENT_CONTINUE_LABEL,
  UPLOAD_AGREEMENT_TITLE,
  UPLOAD_AGREEMENT_WAIT_HINT,
  UPLOAD_RISK_CANCEL_LABEL,
  UPLOAD_RISK_CONFIRM_LABEL,
  UPLOAD_RISK_DIALOG_MESSAGE,
  UPLOAD_RISK_DIALOG_TITLE,
  UPLOAD_CORPUS_DIALOG_HINT,
  UPLOAD_CORPUS_DIALOG_TITLE,
  UPLOAD_TRANSCRIPT_CONFIRM_MESSAGE,
  UPLOAD_TRANSCRIPT_CONFIRM_TITLE,
  UPLOAD_TRANSCRIPT_DIALOG_HINT,
  UPLOAD_TRANSCRIPT_DIALOG_TITLE,
  UPLOAD_VOICE_BUTTON_LABEL,
  UPLOAD_VOICE_STARTED_HINT,
  VOICE_FORGE_CREATE_INTRO,
  VOICE_FORGE_HOME_HINT,
  VOICE_FORGE_TAB_CREATE,
  VOICE_FORGE_TAB_UPDATE,
  VOICE_FORGE_UPDATE_INTRO,
  VOICE_INSTRUCT_HINT,
  VOICE_INSTRUCT_LABEL,
  VOICE_NAME_PROMPT_HINT,
  VOICE_NAME_PROMPT_TITLE
} from '../constants/voiceForge'
import { getDefaultCorpusSnapshot, setRuntimeCorpus, validateCorpusData } from '../services/corpus'
import { resumeVoiceForgeCreation, notifyVoiceUploadReady } from '../services/voiceForgeApi'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import { setVoiceUploadFlowGuard } from '../services/voiceUploadFlowGuard'
import type { BodyPart, CorpusData } from '../types/corpus'

interface VoiceSampleItem {
  folderId: string
  displayName: string
  kind: 'official' | 'custom'
  hasReference: boolean
}

type ForgeTab = 'update' | 'create'

const emit = defineEmits<{
  'layout-change': []
  'voice-creation-started': []
  'upload-flow-active': [active: boolean]
}>()

const activeTab = ref<ForgeTab>('update')
const updateCorpus = reactive<CorpusData>(emptyCorpus())
const createCorpus = reactive<CorpusData>(emptyCorpus())
const instruct = ref('')
const activeSampleFolderId = ref<string | null>(null)
const parseError = ref('')
const applying = ref(false)
const applyingCorpus = ref(false)
const showNameDialog = ref(false)
const pendingSampleName = ref('')
const pendingValidatedCorpus = ref<CorpusData | null>(null)
const voiceSamples = ref<VoiceSampleItem[]>([])
const editingSampleId = ref('')
const updateBaseline = ref<CorpusData>(emptyCorpus())
const creationStatus = ref('')
const loadingSampleCorpus = ref(false)
const experimentalUploadEnabled = ref(false)
const experimentalUploadSaving = ref(false)
const showUploadRiskDialog = ref(false)
const showUploadAgreement = ref(false)
const uploadAgreementChecked = ref(false)
const uploadAgreementSecondsLeft = ref(10)
const uploadReferenceText = ref('')
const uploadWavFileName = ref('')
const pendingUploadCorpus = ref<CorpusData | null>(null)
const showUploadTranscriptDialog = ref(false)
const showUploadTranscriptConfirmDialog = ref(false)
const showUploadCorpusDialog = ref(false)
const uploadCorpus = reactive<CorpusData>(emptyCorpus())
const showUploadNameDialog = ref(false)
const pendingUploadName = ref('')
const uploadingVoice = ref(false)
let uploadAgreementTimer: number | null = null
/** 从点击「上传参考音」到完成/取消，覆盖原生文件选择器等无弹窗阶段 */
const uploadFlowSessionActive = ref(false)

const uploadDialogVisible = computed(
  () =>
    showUploadRiskDialog.value ||
    showUploadAgreement.value ||
    showUploadTranscriptDialog.value ||
    showUploadTranscriptConfirmDialog.value ||
    showUploadCorpusDialog.value ||
    showUploadNameDialog.value
)

const isUploadFlowActive = computed(
  () => uploadFlowSessionActive.value || uploadDialogVisible.value || uploadingVoice.value
)

const showUploadFlowBackdrop = computed(
  () => uploadFlowSessionActive.value && !uploadDialogVisible.value && !uploadingVoice.value
)

function resetUploadFlowState(): void {
  stopUploadAgreementTimer()
  setVoiceUploadFlowGuard(false)
  uploadFlowSessionActive.value = false
  void window.electronAPI?.cancelVoiceUploadStaging?.()
  showUploadRiskDialog.value = false
  showUploadAgreement.value = false
  showUploadTranscriptDialog.value = false
  showUploadTranscriptConfirmDialog.value = false
  showUploadCorpusDialog.value = false
  showUploadNameDialog.value = false
  uploadAgreementChecked.value = false
  uploadAgreementSecondsLeft.value = 10
  uploadReferenceText.value = ''
  uploadWavFileName.value = ''
  pendingUploadCorpus.value = null
  pendingUploadName.value = ''
  mergeInto(uploadCorpus, emptyCorpus())
}

function emptyCorpus(): CorpusData {
  return { head: [], arms: [], body: [], legs: [], tail: [] }
}

function mergeInto(target: CorpusData, data: CorpusData): void {
  const base = emptyCorpus()
  for (const part of BODY_PART_ORDER) {
    base[part] = [...(data[part] ?? [])]
  }
  Object.assign(target, base)
}

function normalizeCorpusForCompare(data: CorpusData): CorpusData {
  const payload = emptyCorpus()
  for (const part of BODY_PART_ORDER) {
    payload[part] = (data[part] ?? []).map((line) => line.trim()).filter(Boolean)
  }
  return payload
}

function corpusEquals(a: CorpusData, b: CorpusData): boolean {
  return JSON.stringify(normalizeCorpusForCompare(a)) === JSON.stringify(normalizeCorpusForCompare(b))
}

function activeCorpus(): CorpusData {
  return activeTab.value === 'create' ? createCorpus : updateCorpus
}

async function loadVoiceSamples(preferredFolderId?: string | null): Promise<void> {
  if (!window.electronAPI?.listVoiceSamples) {
    voiceSamples.value = []
    return
  }

  voiceSamples.value = await window.electronAPI.listVoiceSamples()
  const ready = voiceSamples.value.filter((item) => item.hasReference)
  if (ready.length === 0) {
    editingSampleId.value = ''
    return
  }

  const preferred =
    (preferredFolderId && ready.some((item) => item.folderId === preferredFolderId)
      ? preferredFolderId
      : null) ??
    (editingSampleId.value && ready.some((item) => item.folderId === editingSampleId.value)
      ? editingSampleId.value
      : null) ??
    ready[0]?.folderId ??
    ''
  editingSampleId.value = preferred
}

async function fetchSampleCorpus(folderId: string): Promise<CorpusData> {
  if (window.electronAPI?.readSampleCorpus) {
    return (await window.electronAPI.readSampleCorpus(folderId)) as CorpusData
  }
  return getDefaultCorpusSnapshot()
}

async function loadCorpusForEditingSample(folderId: string): Promise<void> {
  if (!folderId) {
    mergeInto(updateCorpus, emptyCorpus())
    updateBaseline.value = emptyCorpus()
    return
  }
  loadingSampleCorpus.value = true
  try {
    const data = await fetchSampleCorpus(folderId)
    mergeInto(updateCorpus, data)
    updateBaseline.value = normalizeCorpusForCompare(data)
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
        const flag = await window.electronAPI.readExperimentalVoiceUpload()
        experimentalUploadEnabled.value = flag.enabled
      }
      await loadVoiceSamples(config.activeSample?.folderId)
      if (editingSampleId.value) {
        await loadCorpusForEditingSample(editingSampleId.value)
      }
      mergeInto(createCorpus, getDefaultCorpusSnapshot())
      return
    }
    if (window.electronAPI?.readTouchConfig) {
      const config = await window.electronAPI.readTouchConfig()
      mergeInto(updateCorpus, config.corpus as CorpusData)
      updateBaseline.value = normalizeCorpusForCompare(config.corpus as CorpusData)
      mergeInto(createCorpus, getDefaultCorpusSnapshot())
      await loadVoiceSamples()
      return
    }
  } catch (error) {
    console.warn('[VoiceForge] 读取配置失败，使用内置语料', error)
  }

  mergeInto(updateCorpus, getDefaultCorpusSnapshot())
  updateBaseline.value = normalizeCorpusForCompare(getDefaultCorpusSnapshot())
  mergeInto(createCorpus, getDefaultCorpusSnapshot())
  await loadVoiceSamples()
}

function addLine(part: BodyPart): void {
  activeCorpus()[part].push('')
}

function removeLine(part: BodyPart, index: number): void {
  activeCorpus()[part].splice(index, 1)
}

function buildCorpusPayload(source: CorpusData): CorpusData {
  const payload = emptyCorpus()
  for (const part of BODY_PART_ORDER) {
    payload[part] = source[part].map((line) => line.trim()).filter(Boolean)
  }
  return payload
}

function cloneCorpusPayload(data: CorpusData): CorpusData {
  return JSON.parse(JSON.stringify(data)) as CorpusData
}

function validateCorpusSource(source: CorpusData): { ok: true; data: CorpusData } | { ok: false; error: string } {
  const validated = validateCorpusData(buildCorpusPayload(source))
  if (!validated.ok) {
    return validated
  }

  const totalLines = BODY_PART_ORDER.reduce((sum, part) => sum + validated.data[part].length, 0)
  if (totalLines === 0) {
    return { ok: false, error: '请至少添加一句触摸台词' }
  }

  return validated
}

function validateCreateEditor(): { ok: true; data: CorpusData } | { ok: false; error: string } {
  if (!instruct.value.trim()) {
    return { ok: false, error: '请填写声线描述（提示词）' }
  }
  return validateCorpusSource(createCorpus)
}

const updateCorpusChanged = computed(
  () => !corpusEquals(buildCorpusPayload(updateCorpus), updateBaseline.value)
)

const editingSample = computed(() =>
  voiceSamples.value.find((item) => item.folderId === editingSampleId.value)
)

const editingSampleLabel = computed(() => {
  const sample = editingSample.value
  if (!sample) {
    return '未选择'
  }
  const kind = sample.kind === 'official' ? '官方' : '自定义'
  return `${sample.displayName}（${kind}）`
})

const canApplyCorpusPrewarm = computed(() => {
  if (activeTab.value !== 'update') {
    return false
  }
  if (!updateCorpusChanged.value) {
    return false
  }
  if (!editingSample.value?.hasReference) {
    return false
  }
  return validateCorpusSource(updateCorpus).ok
})

const corpusPrewarmDisabledReason = computed(() => {
  if (activeTab.value !== 'update') {
    return ''
  }
  if (!voiceSamples.value.some((item) => item.hasReference)) {
    return '暂无可用的已有声线，请先在「创造新音色」中生成'
  }
  if (!updateCorpusChanged.value) {
    return CORPUS_PREWARM_UNCHANGED_HINT
  }
  if (!editingSample.value?.hasReference) {
    return '所选声线尚未就绪'
  }
  const validated = validateCorpusSource(updateCorpus)
  if (!validated.ok) {
    return validated.error
  }
  return ''
})

async function confirmDiscardUnsavedChanges(): Promise<boolean> {
  if (!updateCorpusChanged.value) {
    return true
  }
  if (window.electronAPI?.showConfirmDialog) {
    return window.electronAPI.showConfirmDialog({
      title: '未保存的语料',
      message: CORPUS_UNSAVED_SWITCH_CONFIRM,
      confirmLabel: '继续切换'
    })
  }
  return window.confirm(CORPUS_UNSAVED_SWITCH_CONFIRM)
}

async function onEditingSampleChange(nextId: string, previousId: string): Promise<void> {
  if (nextId === previousId || loadingSampleCorpus.value) {
    return
  }
  if (!(await confirmDiscardUnsavedChanges())) {
    editingSampleId.value = previousId
    return
  }
  await loadCorpusForEditingSample(nextId)
}

async function applyAndRelaunch(): Promise<void> {
  parseError.value = ''
  const validated = validateCreateEditor()
  if (!validated.ok) {
    parseError.value = validated.error
    return
  }

  pendingValidatedCorpus.value = validated.data
  pendingSampleName.value = ''
  showNameDialog.value = true
}

function cancelNameDialog(): void {
  showNameDialog.value = false
  pendingValidatedCorpus.value = null
}

async function confirmNameAndRelaunch(): Promise<void> {
  const name = pendingSampleName.value.trim()
  if (!name) {
    parseError.value = '请为声线起一个名称'
    return
  }
  if (!pendingValidatedCorpus.value) {
    showNameDialog.value = false
    return
  }

  const restartConfirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: '确认生成',
        message: CREATE_VOICE_CONFIRM,
        confirmLabel: '开始生成'
      })
    : window.confirm(CREATE_VOICE_CONFIRM)
  if (!restartConfirmed) {
    return
  }

  applying.value = true
  showNameDialog.value = false
  parseError.value = ''
  creationStatus.value = ''

  try {
    if (!window.electronAPI?.prepareVoiceCreation) {
      throw new Error('当前环境不支持创建声线流程')
    }
    const corpusPayload = cloneCorpusPayload(pendingValidatedCorpus.value)
    const profile = await window.electronAPI.prepareVoiceCreation(
      'custom_corpus',
      corpusPayload,
      instruct.value.trim(),
      name
    )
    const resumed = await resumeVoiceForgeCreation()
    if (!resumed.ok) {
      parseError.value = `配置已保存，但 TTS 未能开始生成：${resumed.detail ?? '未知错误'}。请确认 TTS 窗口正在运行。`
      applying.value = false
      return
    }
    setTouchFeedbackMode('custom_corpus')
    setRuntimeCorpus(corpusPayload)
    creationStatus.value = CREATE_VOICE_STARTED_HINT
    activeSampleFolderId.value = profile.folderId
    await loadVoiceSamples(profile.folderId)
    window.dispatchEvent(new CustomEvent('voice-forge-boot'))
    emit('voice-creation-started')
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '生成失败'
  } finally {
    applying.value = false
  }
}

function stopUploadAgreementTimer(): void {
  if (uploadAgreementTimer !== null) {
    window.clearInterval(uploadAgreementTimer)
    uploadAgreementTimer = null
  }
}

function startUploadAgreementTimer(): void {
  stopUploadAgreementTimer()
  uploadAgreementSecondsLeft.value = 10
  uploadAgreementTimer = window.setInterval(() => {
    if (uploadAgreementSecondsLeft.value <= 1) {
      uploadAgreementSecondsLeft.value = 0
      stopUploadAgreementTimer()
      return
    }
    uploadAgreementSecondsLeft.value -= 1
  }, 1000)
}

function cancelUploadRiskDialog(): void {
  resetUploadFlowState()
}

function confirmUploadRiskDialog(): void {
  showUploadRiskDialog.value = false
  uploadAgreementChecked.value = false
  showUploadAgreement.value = true
  startUploadAgreementTimer()
}

function cancelUploadAgreement(): void {
  resetUploadFlowState()
}

function uploadAgreementWaitText(): string {
  if (uploadAgreementSecondsLeft.value <= 0) {
    return '已可继续'
  }
  return UPLOAD_AGREEMENT_WAIT_HINT.replace('{seconds}', String(uploadAgreementSecondsLeft.value))
}

async function handleExperimentalUploadToggle(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const next = target.checked
  experimentalUploadSaving.value = true
  try {
    if (!window.electronAPI?.setExperimentalVoiceUpload) {
      throw new Error('当前环境不支持实验功能开关')
    }
    const result = await window.electronAPI.setExperimentalVoiceUpload(next)
    experimentalUploadEnabled.value = result.enabled
  } catch (error) {
    target.checked = !next
    parseError.value = error instanceof Error ? error.message : '无法保存实验开关'
  } finally {
    experimentalUploadSaving.value = false
  }
}

function addUploadCorpusLine(part: BodyPart): void {
  uploadCorpus[part].push('')
}

function removeUploadCorpusLine(part: BodyPart, index: number): void {
  uploadCorpus[part].splice(index, 1)
}

async function beginVoiceUploadFlow(): Promise<void> {
  parseError.value = ''
  resetUploadFlowState()
  mergeInto(uploadCorpus, cloneCorpusPayload(createCorpus))
  uploadFlowSessionActive.value = true
  setVoiceUploadFlowGuard(true)
  showUploadRiskDialog.value = true
}

async function continueUploadAfterAgreement(): Promise<void> {
  if (!uploadAgreementChecked.value || uploadAgreementSecondsLeft.value > 0) {
    return
  }
  stopUploadAgreementTimer()
  showUploadAgreement.value = false
  uploadAgreementChecked.value = false

  if (!window.electronAPI?.pickVoiceUploadWav) {
    parseError.value = '当前环境不支持选择 WAV 文件'
    resetUploadFlowState()
    return
  }

  try {
    const picked = await window.electronAPI.pickVoiceUploadWav()
    if (!picked) {
      resetUploadFlowState()
      return
    }
    uploadWavFileName.value = picked.fileName
    uploadReferenceText.value = ''
    showUploadTranscriptDialog.value = true
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '选择 WAV 文件失败'
    resetUploadFlowState()
  }
}

function cancelUploadTranscriptDialog(): void {
  resetUploadFlowState()
}

function continueUploadAfterTranscript(): void {
  const referenceText = uploadReferenceText.value.trim()
  if (!referenceText) {
    parseError.value = '请填写参考音频原文'
    return
  }
  parseError.value = ''
  showUploadTranscriptDialog.value = false
  showUploadTranscriptConfirmDialog.value = true
}

function cancelUploadTranscriptConfirm(): void {
  showUploadTranscriptConfirmDialog.value = false
  showUploadTranscriptDialog.value = true
}

function confirmUploadTranscript(): void {
  showUploadTranscriptConfirmDialog.value = false
  showUploadCorpusDialog.value = true
}

function cancelUploadCorpusDialog(): void {
  showUploadCorpusDialog.value = false
  showUploadTranscriptConfirmDialog.value = true
}

function continueUploadAfterCorpus(): void {
  const validated = validateCorpusSource(uploadCorpus)
  if (!validated.ok) {
    parseError.value = validated.error
    return
  }
  parseError.value = ''
  pendingUploadCorpus.value = validated.data
  showUploadCorpusDialog.value = false
  pendingUploadName.value = ''
  showUploadNameDialog.value = true
}

function cancelUploadNameDialog(): void {
  resetUploadFlowState()
}

async function confirmUploadNameAndImport(): Promise<void> {
  const name = pendingUploadName.value.trim()
  const referenceText = uploadReferenceText.value.trim()
  if (!name) {
    parseError.value = '请为声线起一个名称'
    return
  }
  if (!referenceText) {
    parseError.value = '请填写参考音频原文'
    return
  }
  if (!pendingUploadCorpus.value) {
    showUploadNameDialog.value = false
    return
  }

  uploadingVoice.value = true
  showUploadNameDialog.value = false
  parseError.value = ''
  creationStatus.value = ''

  try {
    if (!window.electronAPI?.prepareVoiceUpload) {
      throw new Error('当前环境不支持上传声线')
    }
    const corpusPayload = cloneCorpusPayload(pendingUploadCorpus.value)
    const profile = await window.electronAPI.prepareVoiceUpload({
      displayName: name,
      corpus: corpusPayload,
      referenceText
    })
    const notified = await notifyVoiceUploadReady()
    if (!notified.ok) {
      parseError.value = `参考音已保存，但 TTS 未能进入试听：${notified.detail ?? '未知错误'}`
      return
    }
    setTouchFeedbackMode('custom_corpus')
    setRuntimeCorpus(corpusPayload)
    creationStatus.value = UPLOAD_VOICE_STARTED_HINT
    activeSampleFolderId.value = profile.folderId
    await loadVoiceSamples(profile.folderId)
    window.dispatchEvent(new CustomEvent('voice-upload-review'))
    emit('voice-creation-started')
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '上传失败'
  } finally {
    uploadingVoice.value = false
    resetUploadFlowState()
  }
}

async function applyCorpusPrewarmOnly(): Promise<void> {
  if (!canApplyCorpusPrewarm.value) {
    return
  }

  parseError.value = ''
  const validated = validateCorpusSource(updateCorpus)
  if (!validated.ok) {
    parseError.value = validated.error
    return
  }

  const target = editingSample.value
  if (!target) {
    return
  }

  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: SAVE_AND_PREWARM_LABEL,
        message: CORPUS_PREWARM_CONFIRM.replace('{name}', target.displayName),
        confirmLabel: '开始预热'
      })
    : window.confirm(CORPUS_PREWARM_CONFIRM.replace('{name}', target.displayName))
  if (!confirmed) {
    return
  }

  applyingCorpus.value = true
  try {
    if (!window.electronAPI?.applyCorpusPrewarm) {
      throw new Error('当前环境不支持语料预热')
    }
    const corpusPayload = cloneCorpusPayload(validated.data)
    const profile = await window.electronAPI.applyCorpusPrewarm(target.folderId, corpusPayload)
    if (!profile.runtimeUnchanged) {
      activeSampleFolderId.value = profile.folderId
      setTouchFeedbackMode('custom_corpus')
      setRuntimeCorpus(corpusPayload)
    }
    updateBaseline.value = normalizeCorpusForCompare(corpusPayload)

    window.dispatchEvent(new CustomEvent('pet-settings-close'))

    if (!window.electronAPI?.beginVoiceEngineLoad) {
      throw new Error('当前环境不支持语音引擎加载')
    }

    const loadResult = await window.electronAPI.beginVoiceEngineLoad({
      title: '更新语料库',
      message: '正在预热语料库喵~',
      mode: 'prewarm',
      expectedTouchMode: profile.touchMode
    })

    if (!loadResult.ok) {
      throw new Error('TTS 未能完成语料预热，请确认 TTS 窗口正在运行')
    }

    emit('voice-creation-started')
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '语料预热失败'
  } finally {
    applyingCorpus.value = false
  }
}

watch(editingSampleId, (nextId, previousId) => {
  void onEditingSampleChange(nextId, previousId)
})

watch(activeTab, () => {
  parseError.value = ''
  void nextTick(() => emit('layout-change'))
})

watch(
  isUploadFlowActive,
  (active) => {
    emit('upload-flow-active', active)
  },
  { immediate: true }
)

watch(
  [updateCorpus, createCorpus, activeTab],
  () => {
    void nextTick(() => emit('layout-change'))
  },
  { deep: true }
)

onMounted(async () => {
  await loadEditorState()
})

onUnmounted(() => {
  stopUploadAgreementTimer()
  resetUploadFlowState()
})
</script>

<template>
  <div class="voice-forge" :class="{ 'voice-forge--upload-flow': isUploadFlowActive }">
    <div v-show="!isUploadFlowActive" class="voice-forge__main">
    <p class="home-hint">{{ VOICE_FORGE_HOME_HINT }}</p>

    <div class="tab-bar" role="tablist">
      <button
        type="button"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'update' }"
        role="tab"
        :aria-selected="activeTab === 'update'"
        @click="activeTab = 'update'"
      >
        {{ VOICE_FORGE_TAB_UPDATE }}
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ 'tab-btn--active': activeTab === 'create' }"
        role="tab"
        :aria-selected="activeTab === 'create'"
        @click="activeTab = 'create'"
      >
        {{ VOICE_FORGE_TAB_CREATE }}
      </button>
    </div>

    <div v-if="activeTab === 'update'" class="tab-panel">
      <p class="intro">{{ VOICE_FORGE_UPDATE_INTRO }}</p>

      <section class="section">
        <div class="section-head-row">
          <h3 class="section-title">触摸台词</h3>
          <label class="sample-picker">
            <span class="sample-picker__label">{{ CORPUS_EDITING_LABEL }}</span>
            <select
              v-model="editingSampleId"
              class="sample-select"
              :disabled="applyingCorpus || applying || loadingSampleCorpus"
            >
              <option v-if="voiceSamples.length === 0" value="">暂无可选声线</option>
              <option
                v-for="item in voiceSamples"
                :key="item.folderId"
                :value="item.folderId"
                :disabled="!item.hasReference"
              >
                {{ item.displayName }}（{{ item.kind === 'official' ? '官方' : '自定义' }}）
                {{ item.hasReference ? '' : ' · 未就绪' }}
              </option>
            </select>
          </label>
        </div>
        <p class="hint">{{ CORPUS_PER_SAMPLE_HINT }}</p>
        <p v-if="loadingSampleCorpus" class="hint">正在加载「{{ editingSampleLabel }}」的语料…</p>

        <div v-for="part in BODY_PART_ORDER" :key="`update-${part}`" class="part-block">
          <div class="part-head">
            <span class="part-label">{{ BODY_PART_LABELS[part] }}</span>
            <span class="part-hint">{{ BODY_PART_HINTS[part] }}</span>
          </div>

          <div v-if="updateCorpus[part].length === 0" class="empty-lines">暂无台词，点击下方添加</div>

          <div v-for="(_line, index) in updateCorpus[part]" :key="`${part}-${index}`" class="line-row">
            <input
              v-model="updateCorpus[part][index]"
              class="line-input"
              type="text"
              maxlength="200"
              :placeholder="`第 ${index + 1} 句`"
            />
            <button type="button" class="line-remove" aria-label="删除" @click="removeLine(part, index)">
              ×
            </button>
          </div>

          <button type="button" class="line-add" @click="addLine(part)">+ 添加一句</button>
        </div>
      </section>

      <p v-if="corpusPrewarmDisabledReason" class="hint corpus-prewarm-reason">{{ corpusPrewarmDisabledReason }}</p>
      <p v-else class="hint">{{ CORPUS_PREWARM_HINT }}</p>
      <button
        type="button"
        class="apply-btn"
        :disabled="!canApplyCorpusPrewarm || applyingCorpus || applying"
        @click="applyCorpusPrewarmOnly"
      >
        {{ applyingCorpus ? '处理中…' : SAVE_AND_PREWARM_LABEL }}
      </button>
    </div>

    <div v-else class="tab-panel">
      <div class="experimental-bar">
        <label class="experimental-toggle">
          <input
            type="checkbox"
            :checked="experimentalUploadEnabled"
            :disabled="experimentalUploadSaving || applying || uploadingVoice"
            @change="handleExperimentalUploadToggle"
          />
          <span class="experimental-toggle__label">{{ EXPERIMENTAL_UPLOAD_LABEL }}</span>
        </label>
        <p class="experimental-warning">{{ EXPERIMENTAL_UPLOAD_WARNING }}</p>
        <p v-if="experimentalUploadEnabled" class="hint experimental-hint">{{ EXPERIMENTAL_UPLOAD_HINT }}</p>
        <button
          v-if="experimentalUploadEnabled"
          type="button"
          class="upload-btn upload-btn--primary"
          :disabled="applying || uploadingVoice"
          @click="beginVoiceUploadFlow"
        >
          {{ uploadingVoice ? '导入中…' : UPLOAD_VOICE_BUTTON_LABEL }}
        </button>
      </div>

      <p class="intro">{{ VOICE_FORGE_CREATE_INTRO }}</p>

      <section class="section">
        <h3 class="section-title">{{ VOICE_INSTRUCT_LABEL }}</h3>
        <p class="hint">{{ VOICE_INSTRUCT_HINT }}</p>
        <textarea
          v-model="instruct"
          class="instruct-textarea"
          rows="5"
          spellcheck="false"
          placeholder="例如：中文少女，音色偏低偏软，轻声细语，文静内敛…"
        />
      </section>

      <section class="section">
        <h3 class="section-title">触摸台词</h3>
        <p class="hint">生成声线后，这些台词会用于克隆预热与桌宠触摸反馈。</p>

        <div v-for="part in BODY_PART_ORDER" :key="`create-${part}`" class="part-block">
          <div class="part-head">
            <span class="part-label">{{ BODY_PART_LABELS[part] }}</span>
            <span class="part-hint">{{ BODY_PART_HINTS[part] }}</span>
          </div>

          <div v-if="createCorpus[part].length === 0" class="empty-lines">暂无台词，点击下方添加</div>

          <div v-for="(_line, index) in createCorpus[part]" :key="`${part}-${index}`" class="line-row">
            <input
              v-model="createCorpus[part][index]"
              class="line-input"
              type="text"
              maxlength="200"
              :placeholder="`第 ${index + 1} 句`"
            />
            <button type="button" class="line-remove" aria-label="删除" @click="removeLine(part, index)">
              ×
            </button>
          </div>

          <button type="button" class="line-add" @click="addLine(part)">+ 添加一句</button>
        </div>
      </section>

      <p v-if="creationStatus" class="status ready">{{ creationStatus }}</p>
      <button type="button" class="apply-btn" :disabled="applying || uploadingVoice" @click="applyAndRelaunch">
        {{ applying ? '处理中…' : GENERATE_VOICE_LABEL }}
      </button>
    </div>

    <p v-if="parseError && !isUploadFlowActive" class="status error">{{ parseError }}</p>
    </div>

    <Teleport to="body">
      <div
        v-if="showUploadFlowBackdrop"
        class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow"
        aria-hidden="true"
      />

      <div v-if="showUploadRiskDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow">
        <div class="name-dialog agreement-dialog" role="dialog" aria-modal="true">
          <h3 class="name-dialog__title">{{ UPLOAD_RISK_DIALOG_TITLE }}</h3>
          <p class="hint">{{ UPLOAD_RISK_DIALOG_MESSAGE }}</p>
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadRiskDialog">
              {{ UPLOAD_RISK_CANCEL_LABEL }}
            </button>
            <button type="button" class="apply-btn" @click="confirmUploadRiskDialog">
              {{ UPLOAD_RISK_CONFIRM_LABEL }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showUploadAgreement" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow">
        <div class="name-dialog agreement-dialog" role="dialog" aria-modal="true">
          <h3 class="name-dialog__title">{{ UPLOAD_AGREEMENT_TITLE }}</h3>
          <pre class="agreement-body">{{ UPLOAD_AGREEMENT_BODY }}</pre>
          <label class="agreement-check">
            <input v-model="uploadAgreementChecked" type="checkbox" />
            <span>{{ UPLOAD_AGREEMENT_CHECKBOX }}</span>
          </label>
          <p class="hint agreement-wait">{{ uploadAgreementWaitText() }}</p>
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadAgreement">取消</button>
            <button
              type="button"
              class="apply-btn"
              :disabled="!uploadAgreementChecked || uploadAgreementSecondsLeft > 0"
              @click="continueUploadAfterAgreement"
            >
              {{ UPLOAD_AGREEMENT_CONTINUE_LABEL }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="showUploadTranscriptDialog"
        class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow"
        @click.stop
      >
        <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
          <h3 class="name-dialog__title">{{ UPLOAD_TRANSCRIPT_DIALOG_TITLE }}</h3>
          <p v-if="uploadWavFileName" class="hint">已选择：{{ uploadWavFileName }}</p>
          <p class="hint">{{ UPLOAD_TRANSCRIPT_DIALOG_HINT }}</p>
          <textarea
            v-model="uploadReferenceText"
            class="instruct-textarea upload-reference-text"
            rows="5"
            spellcheck="false"
            placeholder="请填写 WAV 里实际说出的完整原文"
          />
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadTranscriptDialog">取消</button>
            <button type="button" class="apply-btn" @click="continueUploadAfterTranscript">下一步</button>
          </div>
        </div>
      </div>

      <div
        v-if="showUploadTranscriptConfirmDialog"
        class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow"
        @click.stop
      >
        <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
          <h3 class="name-dialog__title">{{ UPLOAD_TRANSCRIPT_CONFIRM_TITLE }}</h3>
          <p class="hint">{{ UPLOAD_TRANSCRIPT_CONFIRM_MESSAGE }}</p>
          <pre class="agreement-body transcript-preview">{{ uploadReferenceText.trim() }}</pre>
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadTranscriptConfirm">返回修改</button>
            <button type="button" class="apply-btn" @click="confirmUploadTranscript">确认无误，继续</button>
          </div>
        </div>
      </div>

      <div
        v-if="showUploadCorpusDialog"
        class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow"
        @click.stop
      >
        <div class="name-dialog upload-corpus-dialog" role="dialog" aria-modal="true" @click.stop>
          <h3 class="name-dialog__title">{{ UPLOAD_CORPUS_DIALOG_TITLE }}</h3>
          <p class="hint">{{ UPLOAD_CORPUS_DIALOG_HINT }}</p>

          <div v-for="part in BODY_PART_ORDER" :key="`upload-${part}`" class="part-block">
            <div class="part-head">
              <span class="part-label">{{ BODY_PART_LABELS[part] }}</span>
              <span class="part-hint">{{ BODY_PART_HINTS[part] }}</span>
            </div>

            <div v-if="uploadCorpus[part].length === 0" class="empty-lines">暂无台词，点击下方添加</div>

            <div v-for="(_line, index) in uploadCorpus[part]" :key="`${part}-${index}`" class="line-row">
              <input
                v-model="uploadCorpus[part][index]"
                class="line-input"
                type="text"
                maxlength="200"
                :placeholder="`第 ${index + 1} 句`"
              />
              <button
                type="button"
                class="line-remove"
                aria-label="删除"
                @click="removeUploadCorpusLine(part, index)"
              >
                ×
              </button>
            </div>

            <button type="button" class="line-add" @click="addUploadCorpusLine(part)">+ 添加一句</button>
          </div>

          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadCorpusDialog">返回</button>
            <button type="button" class="apply-btn" @click="continueUploadAfterCorpus">下一步，命名声线</button>
          </div>
        </div>
      </div>

      <div
        v-if="showUploadNameDialog"
        class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow"
        @click.stop
      >
        <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
          <h3 class="name-dialog__title">{{ VOICE_NAME_PROMPT_TITLE }}</h3>
          <p class="hint">{{ VOICE_NAME_PROMPT_HINT }}</p>
          <p v-if="uploadWavFileName" class="hint">已选择：{{ uploadWavFileName }}</p>
          <input
            v-model="pendingUploadName"
            class="name-dialog__input"
            type="text"
            maxlength="32"
            placeholder="例如：文静雪澜"
            @keyup.enter="confirmUploadNameAndImport"
          />
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelUploadNameDialog">取消</button>
            <button type="button" class="apply-btn" @click="confirmUploadNameAndImport">开始导入</button>
          </div>
        </div>
      </div>

      <p v-if="isUploadFlowActive && parseError" class="upload-flow-error" role="alert">
        {{ parseError }}
      </p>
    </Teleport>

    <Teleport to="body">
      <div v-if="showNameDialog" class="name-dialog-overlay name-dialog-overlay--teleport" @click.self="cancelNameDialog">
        <div class="name-dialog" role="dialog" aria-modal="true">
          <h3 class="name-dialog__title">{{ VOICE_NAME_PROMPT_TITLE }}</h3>
          <p class="hint">{{ VOICE_NAME_PROMPT_HINT }}</p>
          <input
            v-model="pendingSampleName"
            class="name-dialog__input"
            type="text"
            maxlength="32"
            placeholder="例如：文静雪澜"
            @keyup.enter="confirmNameAndRelaunch"
          />
          <div class="name-dialog__actions">
            <button type="button" class="secondary-btn" @click="cancelNameDialog">取消</button>
            <button type="button" class="apply-btn" @click="confirmNameAndRelaunch">开始生成</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.voice-forge {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tab-bar {
  display: flex;
  gap: 8px;
}

.tab-btn {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: #f3f4f6;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn--active {
  background: #fff;
  border-color: rgba(236, 72, 153, 0.35);
  color: #db2777;
  box-shadow: 0 1px 4px rgba(236, 72, 153, 0.12);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.home-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #9ca3af;
}

.section {
  padding-top: 4px;
}

.section-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.sample-picker {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.sample-picker__label {
  font-size: 11px;
  color: #6b7280;
}

.setting-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f2f2f7;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.instruct-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
  color: #111827;
  resize: vertical;
  min-height: 96px;
}

.part-block {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.part-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.part-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.part-hint {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.45;
}

.empty-lines {
  margin-bottom: 8px;
  font-size: 12px;
  color: #9ca3af;
}

.line-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.line-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  color: #111827;
}

.line-remove {
  flex-shrink: 0;
  width: 32px;
  border: none;
  border-radius: 8px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.line-add {
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed rgba(236, 72, 153, 0.35);
  border-radius: 8px;
  background: #fff;
  color: #db2777;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.apply-btn {
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

.apply-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.secondary-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sample-select {
  min-width: 148px;
  max-width: 180px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  font-size: 12px;
  color: #111827;
}

.corpus-prewarm-reason {
  margin-top: 0;
  margin-bottom: 0;
}

.cache-info {
  margin-top: 10px;
}

.status {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.status.building,
.status.pending {
  color: #6b7280;
}

.status.ready {
  color: #059669;
}

.status.error {
  color: #dc2626;
}

.ios-switch {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ios-switch__track {
  display: block;
  position: relative;
  width: 56px;
  height: 32px;
  border-radius: 999px;
  background: #e5e5ea;
  border: 1px solid #c7c7cc;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12);
  transition: background 0.25s ease;
}

.ios-switch--on .ios-switch__track {
  background: #34c759;
  border-color: #2fb350;
}

.ios-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.ios-switch--on .ios-switch__knob {
  transform: translateX(24px);
}

.name-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
}

.name-dialog-overlay--teleport {
  z-index: 10000;
}

.name-dialog-overlay--plain {
  background: transparent;
  pointer-events: none;
}

.name-dialog-overlay--plain .name-dialog {
  pointer-events: auto;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
}

.name-dialog-overlay--upload-flow {
  background: transparent;
  pointer-events: auto;
}

.name-dialog-overlay--upload-flow .name-dialog {
  pointer-events: auto;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
}

.upload-flow-error {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 10001;
  max-width: min(360px, calc(100vw - 32px));
  margin: 0;
  padding: 10px 14px;
  transform: translateX(-50%);
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  pointer-events: none;
}

.voice-forge--upload-flow {
  min-height: 0;
}

.transcript-preview {
  max-height: 160px;
  overflow: auto;
}

.upload-btn--primary {
  width: 100%;
  margin-top: 10px;
}

.name-dialog {
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
}

.name-dialog__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.name-dialog__input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  font-size: 13px;
}

.name-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.experimental-bar {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  background: rgba(254, 242, 242, 0.9);
}

.experimental-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.experimental-toggle__label {
  font-size: 13px;
  font-weight: 700;
  color: #b91c1c;
}

.experimental-warning {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  font-weight: 700;
  color: #dc2626;
}

.experimental-hint {
  margin-top: 6px;
}

.upload-divider {
  margin: 4px 0;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

.upload-section {
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(220, 38, 38, 0.35);
  background: #fff;
}

.upload-reference-text {
  min-height: 72px;
}

.upload-btn {
  width: 100%;
  margin-top: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 10px;
  background: #fff7ed;
  color: #b45309;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.upload-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.agreement-dialog {
  max-height: min(80vh, 520px);
  overflow-y: auto;
}

.agreement-body {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
}

.agreement-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
}

.agreement-wait {
  margin-top: 8px;
  text-align: center;
}
</style>

<style>
.name-dialog-overlay--teleport {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
}

.name-dialog-overlay--teleport .name-dialog {
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
}

.name-dialog-overlay--teleport .name-dialog__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.name-dialog-overlay--teleport .hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}

.name-dialog-overlay--teleport .instruct-textarea {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  font-size: 13px;
  resize: vertical;
}

.name-dialog-overlay--teleport .name-dialog__input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  font-size: 13px;
}

.name-dialog-overlay--teleport .name-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.name-dialog-overlay--teleport .apply-btn,
.name-dialog-overlay--teleport .secondary-btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.name-dialog-overlay--teleport .apply-btn {
  border: none;
  background: linear-gradient(135deg, #ec4899, #f472b6);
  color: #fff;
}

.name-dialog-overlay--teleport .apply-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.name-dialog-overlay--teleport .secondary-btn {
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fff;
  color: #374151;
}

.name-dialog-overlay--teleport .agreement-body {
  margin: 0 0 10px;
  padding: 10px;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  color: #374151;
}

.name-dialog-overlay--teleport .agreement-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
}

.name-dialog-overlay--teleport .upload-corpus-dialog {
  width: min(420px, calc(100vw - 24px));
  max-height: min(80vh, 720px);
  overflow: auto;
}

.name-dialog-overlay--teleport .part-block {
  margin-top: 12px;
}

.name-dialog-overlay--teleport .part-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}

.name-dialog-overlay--teleport .part-label {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.name-dialog-overlay--teleport .part-hint {
  font-size: 11px;
  color: #9ca3af;
}

.name-dialog-overlay--teleport .empty-lines {
  margin-bottom: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.name-dialog-overlay--teleport .line-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.name-dialog-overlay--teleport .line-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  font-size: 13px;
}

.name-dialog-overlay--teleport .line-remove {
  width: 32px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.name-dialog-overlay--teleport .line-add {
  margin-bottom: 4px;
  padding: 4px 0;
  border: none;
  background: none;
  color: #ec4899;
  font-size: 12px;
  cursor: pointer;
}

.name-dialog-overlay--teleport.name-dialog-overlay--plain {
  background: transparent;
  pointer-events: none;
}

.name-dialog-overlay--teleport.name-dialog-overlay--plain .name-dialog {
  pointer-events: auto;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
}
</style>
