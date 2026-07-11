import { computed, ref } from 'vue'
import { CREATE_VOICE_CONFIRM, SAVE_AND_PREWARM_LABEL, CORPUS_PREWARM_CONFIRM } from '../../constants/voiceForge'
import { validateCorpusSource } from '../../services/corpus'
import type { useVoiceCorpusEditor } from './useVoiceCorpusEditor'
import type { useVoiceCreationForm } from './useVoiceCreationForm'
import type { useVoiceForgeWorkbench } from './useVoiceForgeWorkbench'
import type { useVoiceUploadWizard } from './useVoiceUploadWizard'
import type { VoiceForgeConfirmOpts, CreateSubmitPayload, UploadStartPayload, PrewarmPayload } from './types'

export type { CreateSubmitPayload, UploadStartPayload, PrewarmPayload, VoiceForgeConfirmOpts } from './types'

export interface VoiceForgeOrchestratorDeps {
  workbench: ReturnType<typeof useVoiceForgeWorkbench>
  creation: ReturnType<typeof useVoiceCreationForm>
  corpus: ReturnType<typeof useVoiceCorpusEditor>
  upload: ReturnType<typeof useVoiceUploadWizard>
  setParseError: (message: string) => void
  clearParseError: () => void
  confirm: (opts: VoiceForgeConfirmOpts) => Promise<boolean>
  pickUploadWav: () => Promise<{ fileName: string } | null>
  onCreateSubmit: (payload: CreateSubmitPayload) => Promise<void>
  onUploadStart: (payload: UploadStartPayload) => Promise<void>
  onPrewarm: (payload: PrewarmPayload) => Promise<void>
  onUploadFlowBegin?: () => void
  onUploadFlowReset?: () => void
}

export function useVoiceForgeOrchestrator(deps: VoiceForgeOrchestratorDeps) {
  const { workbench, creation, corpus, upload } = deps

  const showNameDialog = ref(false)
  const showUploadRiskDialog = ref(false)
  const showUploadAgreement = ref(false)
  const showUploadTranscriptDialog = ref(false)
  const showUploadTranscriptConfirmDialog = ref(false)
  const showUploadCorpusDialog = ref(false)
  const showUploadNameDialog = ref(false)
  const uploadFlowSessionActive = ref(false)

  const uploadDialogVisible = computed(
    () =>
      showUploadRiskDialog.value || showUploadAgreement.value || showUploadTranscriptDialog.value ||
      showUploadTranscriptConfirmDialog.value || showUploadCorpusDialog.value || showUploadNameDialog.value
  )
  const isUploadFlowActive = computed(
    () => uploadFlowSessionActive.value || uploadDialogVisible.value || upload.uploadingVoice.value
  )
  const showUploadFlowBackdrop = computed(
    () => uploadFlowSessionActive.value && !uploadDialogVisible.value && !upload.uploadingVoice.value
  )

  function closeUploadDialogs(): void {
    showUploadRiskDialog.value = false
    showUploadAgreement.value = false
    showUploadTranscriptDialog.value = false
    showUploadTranscriptConfirmDialog.value = false
    showUploadCorpusDialog.value = false
    showUploadNameDialog.value = false
  }

  function resetUploadFlow(): void {
    upload.stopAgreementTimer()
    upload.resetWizardState()
    uploadFlowSessionActive.value = false
    closeUploadDialogs()
    deps.onUploadFlowReset?.()
  }

  function onApplyAndRelaunch(): void {
    deps.clearParseError()
    const validated = creation.validateCreateEditor(corpus.createCorpus)
    if (!validated.ok) return deps.setParseError(validated.error)
    creation.pendingValidatedCorpus.value = validated.data
    creation.pendingSampleName.value = ''
    showNameDialog.value = true
  }

  function closeNameDialog(): void {
    showNameDialog.value = false
    creation.pendingValidatedCorpus.value = null
  }

  async function onConfirmCreate(): Promise<void> {
    const name = creation.pendingSampleName.value.trim()
    if (!name) return deps.setParseError('请为声线起一个名称')
    if (!creation.pendingValidatedCorpus.value) return closeNameDialog()
    if (!(await deps.confirm({ title: '确认生成', message: CREATE_VOICE_CONFIRM, confirmLabel: '开始生成' }))) return
    showNameDialog.value = false
    deps.clearParseError()
    creation.creationStatus.value = ''
    workbench.applying.value = true
    try {
      await deps.onCreateSubmit({
        displayName: name,
        corpus: creation.pendingValidatedCorpus.value,
        instruct: creation.instruct.value.trim()
      })
    } catch (error) {
      deps.setParseError(error instanceof Error ? error.message : '生成失败')
    } finally {
      workbench.applying.value = false
      creation.pendingValidatedCorpus.value = null
    }
  }

  function onBeginVoiceUploadFlow(): void {
    deps.clearParseError()
    resetUploadFlow()
    upload.seedFromCreateCorpus(corpus.createCorpus)
    uploadFlowSessionActive.value = true
    showUploadRiskDialog.value = true
    deps.onUploadFlowBegin?.()
  }

  function onConfirmUploadRisk(): void {
    showUploadRiskDialog.value = false
    upload.uploadAgreementChecked.value = false
    showUploadAgreement.value = true
    upload.startAgreementTimer()
  }

  async function onContinueUploadAfterAgreement(): Promise<void> {
    if (!upload.uploadAgreementChecked.value || upload.uploadAgreementSecondsLeft.value > 0) return
    try {
      const picked = await deps.pickUploadWav()
      if (!picked) return resetUploadFlow()
      upload.prepareTranscriptStep(picked.fileName)
      showUploadAgreement.value = false
      showUploadTranscriptDialog.value = true
    } catch (error) {
      deps.setParseError(error instanceof Error ? error.message : '选择 WAV 文件失败')
      resetUploadFlow()
    }
  }

  function onContinueUploadAfterTranscript(): void {
    if (!upload.uploadReferenceText.value.trim()) return deps.setParseError('请填写参考音频原文')
    deps.clearParseError()
    showUploadTranscriptDialog.value = false
    showUploadTranscriptConfirmDialog.value = true
  }

  function backToTranscriptStep(): void {
    showUploadTranscriptConfirmDialog.value = false
    showUploadTranscriptDialog.value = true
  }

  function openCorpusStep(): void {
    showUploadTranscriptConfirmDialog.value = false
    showUploadCorpusDialog.value = true
  }

  function backToTranscriptConfirmStep(): void {
    showUploadCorpusDialog.value = false
    showUploadTranscriptConfirmDialog.value = true
  }

  function onContinueUploadAfterCorpus(): void {
    const validated = validateCorpusSource(upload.uploadCorpus)
    if (!validated.ok) return deps.setParseError(validated.error)
    deps.clearParseError()
    upload.prepareNameStep(validated.data)
    showUploadCorpusDialog.value = false
    showUploadNameDialog.value = true
  }

  async function onConfirmUploadImport(): Promise<void> {
    const name = upload.pendingUploadName.value.trim()
    const referenceText = upload.uploadReferenceText.value.trim()
    if (!name) return deps.setParseError('请为声线起一个名称')
    if (!referenceText) return deps.setParseError('请填写参考音频原文')
    if (!upload.pendingUploadCorpus.value) return void (showUploadNameDialog.value = false)
    upload.uploadingVoice.value = true
    showUploadNameDialog.value = false
    deps.clearParseError()
    creation.creationStatus.value = ''
    try {
      await deps.onUploadStart({ displayName: name, corpus: upload.pendingUploadCorpus.value, referenceText })
    } catch (error) {
      deps.setParseError(error instanceof Error ? error.message : '上传失败')
    } finally {
      upload.uploadingVoice.value = false
      resetUploadFlow()
    }
  }

  async function onApplyCorpusPrewarm(): Promise<void> {
    if (!corpus.canApplyCorpusPrewarm.value) return
    deps.clearParseError()
    const validated = validateCorpusSource(corpus.updateCorpus)
    if (!validated.ok) return deps.setParseError(validated.error)
    const target = workbench.editingSample.value
    if (!target) return
    if (!(await deps.confirm({
      title: SAVE_AND_PREWARM_LABEL,
      message: CORPUS_PREWARM_CONFIRM.replace('{name}', target.displayName),
      confirmLabel: '开始预热'
    }))) return
    workbench.applyingCorpus.value = true
    try {
      await deps.onPrewarm({ folderId: target.folderId, displayName: target.displayName, corpus: validated.data })
    } catch (error) {
      deps.setParseError(error instanceof Error ? error.message : '语料预热失败')
    } finally {
      workbench.applyingCorpus.value = false
    }
  }

  return {
    showNameDialog, showUploadRiskDialog, showUploadAgreement, showUploadTranscriptDialog,
    showUploadTranscriptConfirmDialog, showUploadCorpusDialog, showUploadNameDialog,
    isUploadFlowActive, showUploadFlowBackdrop, onApplyAndRelaunch, closeNameDialog, onConfirmCreate,
    onBeginVoiceUploadFlow, resetUploadFlow, onConfirmUploadRisk, onContinueUploadAfterAgreement,
    onContinueUploadAfterTranscript, backToTranscriptStep, openCorpusStep, backToTranscriptConfirmStep,
    onContinueUploadAfterCorpus, onConfirmUploadImport, onApplyCorpusPrewarm, agreementWaitText: upload.agreementWaitText
  }
}
