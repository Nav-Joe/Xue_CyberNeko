<script setup lang="ts">
import { computed, onMounted, provide } from 'vue'

import { useHomeAppearance } from '../../composables/useHomeAppearance'
import { useCharacterCardWorkbench } from '../../composables/chat/useCharacterCardWorkbench'
import { CHARACTER_CARD_WORKBENCH_KEY } from '../../composables/chat/characterCardWorkbenchContext'

import ChatCharacterCardSettings from './ChatCharacterCardSettings.vue'
import ChatLlmSettings from './ChatLlmSettings.vue'
import ChatTtsSettings from './ChatTtsSettings.vue'
import ChatTtsCloudSettings from './ChatTtsCloudSettings.vue'
import ChatSttSettings from './ChatSttSettings.vue'

import '../../styles/neko-tokens.css'
import './chat-panel-theme.css'
import './chat-appearance.css'

const props = defineProps<{
  ensureLocalLlamaReady?: () => Promise<boolean>
}>()

const emit = defineEmits<{
  back: []
  changed: []
}>()

const { appearance } = useHomeAppearance()
const workbench = useCharacterCardWorkbench()
provide(CHARACTER_CARD_WORKBENCH_KEY, workbench)

const activeCard = computed(() => workbench.draft.value ?? workbench.activeCard.value)

onMounted(() => {
  void workbench.reload()
})

function onSettingsChanged(): void {
  emit('changed')
}

function onCardChanged(): void {
  emit('changed')
}
</script>

<template>
  <div class="chat-settings neko-ui" :data-appearance="appearance">
    <header class="chat-settings__header">
      <button type="button" class="chat-settings__back" @click="emit('back')">← 返回聊天</button>
      <div class="chat-settings__title-block">
        <p class="chat-settings__badge">聊天设置</p>
        <h1>模型与角色</h1>
      </div>
    </header>

    <div class="chat-settings__body">
      <section class="chat-settings__section" aria-label="对话语音">
        <ChatTtsSettings @changed="onSettingsChanged" />
      </section>
      <section class="chat-settings__section" aria-label="语音后端">
        <ChatTtsCloudSettings @changed="onSettingsChanged" />
      </section>
      <section class="chat-settings__section" aria-label="语音输入">
        <ChatSttSettings @changed="onSettingsChanged" />
      </section>
      <section class="chat-settings__section" aria-label="对话模型">
        <ChatLlmSettings
          :card="activeCard"
          :ensure-local-llama-ready="props.ensureLocalLlamaReady"
          @changed="onSettingsChanged"
        />
      </section>
      <section class="chat-settings__section" aria-label="角色卡">
        <ChatCharacterCardSettings @changed="onCardChanged" />
      </section>
      <p v-if="workbench.loading.value" class="chat-theme__hint chat-settings__loading">同步角色卡…</p>
    </div>
  </div>
</template>

<style scoped>
.chat-settings {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.chat-settings__header {
  display: flex;
  align-items: flex-start;
  gap: var(--home-space-2);
  padding: var(--home-space-2) 64px var(--home-space-2) var(--home-space-3);
  border-bottom: 1px solid var(--home-line);
  background: var(--home-color-surface);
}

.chat-settings__back {
  margin-top: 6px;
  min-height: var(--home-target);
  padding: 8px 14px;
  border: 1.5px solid var(--home-color-primary);
  border-radius: var(--home-radius-pill);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.chat-settings__back:hover {
  color: var(--home-color-on-accent);
  border-color: var(--home-color-accent);
  background: var(--home-color-accent);
}

.chat-settings__title-block h1 {
  margin: 0;
  font-size: var(--home-font-display);
  line-height: 1.2;
  color: var(--home-color-text);
}

.chat-settings__badge {
  display: inline-block;
  margin: 0 0 8px;
  padding: 4px 12px;
  border-radius: var(--home-radius-pill);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
  font-size: var(--home-font-meta);
  font-weight: 700;
}

.chat-settings__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--home-space-3);
  max-width: 720px;
}

.chat-settings__loading {
  margin-top: 8px;
}
</style>
