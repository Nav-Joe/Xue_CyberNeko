<script setup lang="ts">
import { VOICE_FORGE_TAB_CREATE, VOICE_FORGE_TAB_UPDATE } from '../../constants/voiceForge'
import type { ForgeTab } from '../../composables/voice-forge/types'

defineProps<{
  activeTab: ForgeTab
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: ForgeTab]
}>()
</script>

<template>
  <div class="tab-bar" role="tablist">
    <button
      type="button"
      class="tab-btn"
      :class="{ 'tab-btn--active': activeTab === 'update' }"
      role="tab"
      :aria-selected="activeTab === 'update'"
      @click="emit('update:activeTab', 'update')"
    >
      {{ VOICE_FORGE_TAB_UPDATE }}
    </button>
    <button
      type="button"
      class="tab-btn"
      :class="{ 'tab-btn--active': activeTab === 'create' }"
      role="tab"
      :aria-selected="activeTab === 'create'"
      @click="emit('update:activeTab', 'create')"
    >
      {{ VOICE_FORGE_TAB_CREATE }}
    </button>
  </div>
</template>

<style scoped>
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
</style>
