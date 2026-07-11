import { computed, ref } from 'vue'
import type { ForgeTab, VoiceSampleItem } from './types'

export function useVoiceForgeWorkbench() {
  const activeTab = ref<ForgeTab>('update')
  const voiceSamples = ref<VoiceSampleItem[]>([])
  const editingSampleId = ref('')
  const activeSampleFolderId = ref<string | null>(null)
  const loadingSampleCorpus = ref(false)
  const applying = ref(false)
  const applyingCorpus = ref(false)
  const parseError = ref('')
  const experimentalUploadEnabled = ref(false)
  const experimentalUploadSaving = ref(false)

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

  function resolveEditingSampleId(preferredFolderId?: string | null): void {
    const ready = voiceSamples.value.filter((item) => item.hasReference)
    if (ready.length === 0) {
      editingSampleId.value = ''
      return
    }

    editingSampleId.value =
      (preferredFolderId && ready.some((item) => item.folderId === preferredFolderId)
        ? preferredFolderId
        : null) ??
      (editingSampleId.value && ready.some((item) => item.folderId === editingSampleId.value)
        ? editingSampleId.value
        : null) ??
      ready[0]?.folderId ??
      ''
  }

  return {
    activeTab,
    voiceSamples,
    editingSampleId,
    activeSampleFolderId,
    loadingSampleCorpus,
    applying,
    applyingCorpus,
    parseError,
    experimentalUploadEnabled,
    experimentalUploadSaving,
    editingSample,
    editingSampleLabel,
    resolveEditingSampleId
  }
}
