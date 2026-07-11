import { reactive, ref } from 'vue'
import { UPLOAD_AGREEMENT_WAIT_HINT } from '../../constants/voiceForge'
import { cloneCorpusPayload, emptyCorpus, mergeIntoCorpus } from '../../services/corpus'
import type { BodyPart, CorpusData } from '../../types/corpus'

export function useVoiceUploadWizard() {
  const uploadAgreementChecked = ref(false)
  const uploadAgreementSecondsLeft = ref(10)
  const uploadReferenceText = ref('')
  const uploadWavFileName = ref('')
  const pendingUploadCorpus = ref<CorpusData | null>(null)
  const uploadCorpus = reactive<CorpusData>(emptyCorpus())
  const pendingUploadName = ref('')
  const uploadingVoice = ref(false)

  let uploadAgreementTimer: number | null = null

  function stopAgreementTimer(): void {
    if (uploadAgreementTimer !== null) {
      window.clearInterval(uploadAgreementTimer)
      uploadAgreementTimer = null
    }
  }

  function startAgreementTimer(): void {
    stopAgreementTimer()
    uploadAgreementSecondsLeft.value = 10
    uploadAgreementTimer = window.setInterval(() => {
      if (uploadAgreementSecondsLeft.value <= 1) {
        uploadAgreementSecondsLeft.value = 0
        stopAgreementTimer()
        return
      }
      uploadAgreementSecondsLeft.value -= 1
    }, 1000)
  }

  function resetWizardState(): void {
    stopAgreementTimer()
    uploadAgreementChecked.value = false
    uploadAgreementSecondsLeft.value = 10
    uploadReferenceText.value = ''
    uploadWavFileName.value = ''
    pendingUploadCorpus.value = null
    pendingUploadName.value = ''
    uploadingVoice.value = false
    mergeIntoCorpus(uploadCorpus, emptyCorpus())
  }

  function seedFromCreateCorpus(createCorpus: CorpusData): void {
    mergeIntoCorpus(uploadCorpus, cloneCorpusPayload(createCorpus))
  }

  function prepareTranscriptStep(fileName: string): void {
    stopAgreementTimer()
    uploadAgreementChecked.value = false
    uploadWavFileName.value = fileName
    uploadReferenceText.value = ''
  }

  function prepareNameStep(validated: CorpusData): void {
    pendingUploadCorpus.value = validated
    pendingUploadName.value = ''
  }

  function agreementWaitText(): string {
    if (uploadAgreementSecondsLeft.value <= 0) {
      return '已可继续'
    }
    return UPLOAD_AGREEMENT_WAIT_HINT.replace('{seconds}', String(uploadAgreementSecondsLeft.value))
  }

  function addUploadLine(part: BodyPart): void {
    uploadCorpus[part].push('')
  }

  function removeUploadLine(part: BodyPart, index: number): void {
    uploadCorpus[part].splice(index, 1)
  }

  return {
    uploadAgreementChecked,
    uploadAgreementSecondsLeft,
    uploadReferenceText,
    uploadWavFileName,
    pendingUploadCorpus,
    uploadCorpus,
    pendingUploadName,
    uploadingVoice,
    stopAgreementTimer,
    startAgreementTimer,
    resetWizardState,
    seedFromCreateCorpus,
    prepareTranscriptStep,
    prepareNameStep,
    agreementWaitText,
    addUploadLine,
    removeUploadLine
  }
}
