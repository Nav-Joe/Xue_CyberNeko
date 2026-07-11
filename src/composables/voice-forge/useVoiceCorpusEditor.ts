import { computed, reactive, ref } from 'vue'
import { CORPUS_PREWARM_UNCHANGED_HINT } from '../../constants/voiceForge'
import {
  corpusEquals,
  emptyCorpus,
  mergeIntoCorpus,
  normalizeCorpusForCompare,
  validateCorpusSource
} from '../../services/corpus'
import type { BodyPart, CorpusData } from '../../types/corpus'
import type { ForgeTab, VoiceSampleItem } from './types'

export function useVoiceCorpusEditor(options: {
  activeTab: { value: ForgeTab }
  voiceSamples: { value: VoiceSampleItem[] }
  editingSample: { value: VoiceSampleItem | undefined }
}) {
  const updateCorpus = reactive<CorpusData>(emptyCorpus())
  const createCorpus = reactive<CorpusData>(emptyCorpus())
  const updateBaseline = ref<CorpusData>(emptyCorpus())

  const updateCorpusChanged = computed(
    () => !corpusEquals(normalizeCorpusForCompare(updateCorpus), updateBaseline.value)
  )

  const canApplyCorpusPrewarm = computed(() => {
    if (options.activeTab.value !== 'update') {
      return false
    }
    if (!updateCorpusChanged.value) {
      return false
    }
    if (!options.editingSample.value?.hasReference) {
      return false
    }
    return validateCorpusSource(updateCorpus).ok
  })

  const corpusPrewarmDisabledReason = computed(() => {
    if (options.activeTab.value !== 'update') {
      return ''
    }
    if (!options.voiceSamples.value.some((item) => item.hasReference)) {
      return '暂无可用的已有声线，请先在「创造新音色」中生成'
    }
    if (!updateCorpusChanged.value) {
      return CORPUS_PREWARM_UNCHANGED_HINT
    }
    if (!options.editingSample.value?.hasReference) {
      return '所选声线尚未就绪'
    }
    const validated = validateCorpusSource(updateCorpus)
    if (!validated.ok) {
      return validated.error
    }
    return ''
  })

  function setUpdateCorpus(data: CorpusData): void {
    mergeIntoCorpus(updateCorpus, data)
    updateBaseline.value = normalizeCorpusForCompare(data)
  }

  function clearUpdateCorpus(): void {
    mergeIntoCorpus(updateCorpus, emptyCorpus())
    updateBaseline.value = emptyCorpus()
  }

  function markUpdateSaved(data: CorpusData): void {
    updateBaseline.value = normalizeCorpusForCompare(data)
  }

  function resetCreateCorpus(data: CorpusData): void {
    mergeIntoCorpus(createCorpus, data)
  }

  function addUpdateLine(part: BodyPart): void {
    updateCorpus[part].push('')
  }

  function removeUpdateLine(part: BodyPart, index: number): void {
    updateCorpus[part].splice(index, 1)
  }

  function addCreateLine(part: BodyPart): void {
    createCorpus[part].push('')
  }

  function removeCreateLine(part: BodyPart, index: number): void {
    createCorpus[part].splice(index, 1)
  }

  return {
    updateCorpus,
    createCorpus,
    updateBaseline,
    updateCorpusChanged,
    canApplyCorpusPrewarm,
    corpusPrewarmDisabledReason,
    setUpdateCorpus,
    clearUpdateCorpus,
    markUpdateSaved,
    resetCreateCorpus,
    addUpdateLine,
    removeUpdateLine,
    addCreateLine,
    removeCreateLine
  }
}
