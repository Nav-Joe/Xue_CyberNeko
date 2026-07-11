import { computed, ref } from 'vue'

import {
  activateAndSaveCharacterCard,
  createBlankCharacterCard,
  deleteAndSaveCharacterCard,
  getActiveCharacterCard,
  loadCharacterCardsStore,
  upsertAndSaveCharacterCard
} from '../../services/chat/characterCardStore'
import { buildChatPromptMessages } from '../../services/chat/promptBuilder'
import { splitTextForTts } from '../../services/chat/textSplitter'
import type { CharacterCard, CharacterCardsStore, ChatHistoryMessage } from '../../services/chat/types'

export function useCharacterCardWorkbench() {
  const store = ref<CharacterCardsStore | null>(null)
  const draft = ref<CharacterCard | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const status = ref('')

  const testUserInput = ref('今天天气怎么样？')
  const testHistoryJson = ref('[{"role":"user","content":"你好"}]')
  const promptPreview = ref<ChatHistoryMessage[]>([])
  const promptError = ref('')

  const ttsTestText = ref('你好呀。今天天气不错！要不要一起晒太阳？')
  const ttsSegments = computed(() => splitTextForTts(ttsTestText.value))

  const activeCard = computed(() => (store.value ? getActiveCharacterCard(store.value) : null))

  function setStatus(message: string): void {
    status.value = message
  }

  function selectDraft(card: CharacterCard): void {
    draft.value = { ...card }
    error.value = ''
  }

  function syncDraftFromActive(): void {
    const card = activeCard.value
    if (card) selectDraft(card)
  }

  async function reload(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      store.value = await loadCharacterCardsStore()
      syncDraftFromActive()
      setStatus('已从 userData 加载角色卡')
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function saveDraft(): Promise<void> {
    if (!store.value || !draft.value) return
    saving.value = true
    error.value = ''
    try {
      store.value = await upsertAndSaveCharacterCard(store.value, draft.value)
      syncDraftFromActive()
      setStatus('角色卡已保存')
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败'
    } finally {
      saving.value = false
    }
  }

  async function createNewCard(): Promise<void> {
    if (!store.value) return
    const name = `角色卡 ${store.value.cards.length + 1}`
    const card = createBlankCharacterCard(name)
    store.value = await upsertAndSaveCharacterCard(store.value, card)
    store.value = await activateAndSaveCharacterCard(store.value, card.id)
    selectDraft(card)
    setStatus(`已创建并激活「${name}」`)
  }

  async function deleteDraftCard(): Promise<void> {
    if (!store.value || !draft.value) return
    const cardId = draft.value.id
    const cardName = draft.value.name
    saving.value = true
    error.value = ''
    try {
      store.value = await deleteAndSaveCharacterCard(store.value, cardId)
      syncDraftFromActive()
      setStatus(`已删除「${cardName}」`)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除失败'
    } finally {
      saving.value = false
    }
  }

  async function activateDraftCard(): Promise<void> {
    if (!store.value || !draft.value) return
    saving.value = true
    error.value = ''
    try {
      store.value = await activateAndSaveCharacterCard(store.value, draft.value.id)
      syncDraftFromActive()
      setStatus(`已切换激活角色：${draft.value.name}`)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '切换失败'
    } finally {
      saving.value = false
    }
  }

  function parseTestHistory(): ChatHistoryMessage[] {
    const parsed = JSON.parse(testHistoryJson.value) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error('历史记录须为 JSON 数组')
    }
    return parsed.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('历史记录项无效')
      const row = item as { role?: unknown; content?: unknown }
      if (row.role !== 'user' && row.role !== 'assistant' && row.role !== 'system') {
        throw new Error('role 须为 user / assistant / system')
      }
      if (typeof row.content !== 'string') throw new Error('content 须为字符串')
      return { role: row.role, content: row.content }
    })
  }

  async function refreshPromptPreview(): Promise<void> {
    promptError.value = ''
    promptPreview.value = []
    const card = draft.value ?? activeCard.value
    if (!card) {
      promptError.value = '请先选择角色卡'
      return
    }
    try {
      const history = parseTestHistory()
      promptPreview.value = await buildChatPromptMessages({
        card,
        history,
        userInput: testUserInput.value
      })
    } catch (err) {
      promptError.value = err instanceof Error ? err.message : 'Prompt 预览失败'
    }
  }

  return {
    store,
    draft,
    loading,
    saving,
    error,
    status,
    activeCard,
    testUserInput,
    testHistoryJson,
    promptPreview,
    promptError,
    ttsTestText,
    ttsSegments,
    reload,
    selectDraft,
    saveDraft,
    createNewCard,
    deleteDraftCard,
    activateDraftCard,
    refreshPromptPreview
  }
}
