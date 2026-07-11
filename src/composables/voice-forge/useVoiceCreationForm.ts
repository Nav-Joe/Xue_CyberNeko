import { ref } from 'vue'
import { validateCorpusSource } from '../../services/corpus'
import type { CorpusData } from '../../types/corpus'

export function useVoiceCreationForm() {
  const instruct = ref('')
  const creationStatus = ref('')
  const pendingSampleName = ref('')
  const pendingValidatedCorpus = ref<CorpusData | null>(null)

  function validateCreateEditor(createCorpus: CorpusData): { ok: true; data: CorpusData } | { ok: false; error: string } {
    if (!instruct.value.trim()) {
      return { ok: false, error: '请填写声线描述（提示词）' }
    }
    return validateCorpusSource(createCorpus)
  }

  return {
    instruct,
    creationStatus,
    pendingSampleName,
    pendingValidatedCorpus,
    validateCreateEditor
  }
}
