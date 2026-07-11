<script setup lang="ts">
import { computed } from 'vue'
import { useCharacterCardWorkbenchContext } from '../../composables/chat/characterCardWorkbenchContext'
import { formatCharacterCardListLabel } from '../../services/chat/characterCardDefaults'
import { orderCharacterCardsForDisplay } from '../../services/chat/characterCardMutations'
import { DEFAULT_CHARACTER_CARD_ID } from '../../services/chat/types'

import './chat-panel-theme.css'

const emit = defineEmits<{
  changed: []
}>()

const {
  store,
  draft,
  loading,
  saving,
  error,
  status,
  selectDraft,
  saveDraft,
  createNewCard,
  deleteDraftCard,
  activateDraftCard
} = useCharacterCardWorkbenchContext()

const cardsForSelect = computed(() =>
  store.value ? orderCharacterCardsForDisplay(store.value.cards) : []
)

function onSelectCard(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  const card = store.value?.cards.find((item) => item.id === id)
  if (card) selectDraft(card)
}

async function confirmDelete(): Promise<void> {
  if (!draft.value || draft.value.id === DEFAULT_CHARACTER_CARD_ID) return
  const ok =
    (await window.electronAPI?.showConfirmDialog?.({
      title: '删除角色卡',
      message: `确定删除「${draft.value.name}」？此操作不可撤销。`,
      confirmLabel: '删除'
    })) ?? window.confirm(`确定删除「${draft.value.name}」？`)
  if (ok) {
    await deleteDraftCard()
    emit('changed')
  }
}

async function onSave(): Promise<void> {
  await saveDraft()
  emit('changed')
}

async function onCreate(): Promise<void> {
  await createNewCard()
  emit('changed')
}

async function onActivate(): Promise<void> {
  await activateDraftCard()
  emit('changed')
}
</script>

<template>
  <section class="card-settings">
    <h3 class="chat-theme__section-title">角色卡</h3>
    <p class="chat-theme__hint">
      「默认角色卡」为固定槽位，始终保留在下拉列表中，可随时切回；在此槽位内编辑并保存后，会记住你的修改。下方为自定义角色卡。
    </p>

    <p v-if="loading" class="chat-theme__hint">加载中…</p>
    <p v-if="error" class="chat-theme__error">{{ error }}</p>
    <p v-else-if="status" class="chat-theme__hint">{{ status }}</p>

    <select
      class="chat-theme__select"
      :value="draft?.id ?? ''"
      :disabled="!store"
      @change="onSelectCard"
    >
      <option v-for="card in cardsForSelect" :key="card.id" :value="card.id">
        {{ formatCharacterCardListLabel(card) }}{{ store?.activeCardId === card.id ? '（当前）' : '' }}
      </option>
    </select>

    <template v-if="draft">
      <div class="card-settings__field">
        <label class="chat-theme__label" for="card-name">角色名称</label>
        <input id="card-name" v-model="draft.name" class="chat-theme__input" type="text" placeholder="例如：雪澜" />
      </div>
      <div class="card-settings__field">
        <label class="chat-theme__label" for="card-prompt">角色设定</label>
        <textarea
          id="card-prompt"
          v-model="draft.rolePrompt"
          class="chat-theme__textarea"
          rows="4"
          placeholder="性格、背景、说话方式…"
        />
      </div>
      <div class="card-settings__field">
        <label class="chat-theme__label" for="card-likes">喜好</label>
        <textarea id="card-likes" v-model="draft.likes" class="chat-theme__textarea" rows="2" placeholder="可选" />
      </div>
    </template>

    <div class="card-settings__actions">
      <button type="button" class="chat-theme__btn" :disabled="saving || !draft" @click="onSave">保存</button>
      <button type="button" class="chat-theme__btn chat-theme__btn--ghost" :disabled="saving" @click="onCreate">
        新建
      </button>
      <button
        type="button"
        class="chat-theme__btn chat-theme__btn--ghost"
        :disabled="saving || !draft || draft.id === DEFAULT_CHARACTER_CARD_ID"
        @click="confirmDelete"
      >
        删除
      </button>
      <button
        type="button"
        class="chat-theme__btn chat-theme__btn--ghost"
        :disabled="saving || !draft || store?.activeCardId === draft.id"
        @click="onActivate"
      >
        设为当前
      </button>
    </div>
  </section>
</template>

<style scoped>
.card-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #fdf2f8;
}

.card-settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
