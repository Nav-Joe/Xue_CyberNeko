<script setup lang="ts">
import { ref } from 'vue'
import VoiceSampleSwitcher from '../VoiceSampleSwitcher.vue'
import HomeCloudVoiceSwitcher from './HomeCloudVoiceSwitcher.vue'

type VoiceTab = 'local' | 'cloud'

const tab = ref<VoiceTab>('local')
</script>

<template>
  <section class="voice-studio" aria-label="声线管理">
    <div class="voice-studio__tabs" role="tablist" aria-label="声线来源">
      <button
        id="voice-tab-local"
        type="button"
        role="tab"
        class="voice-studio__tab"
        :class="{ 'voice-studio__tab--on': tab === 'local' }"
        :aria-selected="tab === 'local'"
        aria-controls="voice-panel-local"
        @click="tab = 'local'"
      >
        本地声线
      </button>
      <button
        id="voice-tab-cloud"
        type="button"
        role="tab"
        class="voice-studio__tab"
        :class="{ 'voice-studio__tab--on': tab === 'cloud' }"
        :aria-selected="tab === 'cloud'"
        aria-controls="voice-panel-cloud"
        @click="tab = 'cloud'"
      >
        云端声线
      </button>
    </div>

    <div
      v-show="tab === 'local'"
      id="voice-panel-local"
      class="voice-studio__panel"
      role="tabpanel"
      aria-labelledby="voice-tab-local"
    >
      <VoiceSampleSwitcher embedded />
    </div>
    <div
      v-show="tab === 'cloud'"
      id="voice-panel-cloud"
      class="voice-studio__panel"
      role="tabpanel"
      aria-labelledby="voice-tab-cloud"
    >
      <HomeCloudVoiceSwitcher embedded />
    </div>
  </section>
</template>

<style scoped>
.voice-studio {
  display: flex;
  flex-direction: column;
  gap: var(--home-space-2);
  margin-bottom: var(--home-space-2);
}

.voice-studio__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--home-space-1);
}

.voice-studio__tab {
  min-height: var(--home-target);
  border: 1.5px solid var(--home-line);
  border-radius: var(--home-radius-pill);
  background: transparent;
  color: var(--home-color-muted);
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.voice-studio__tab--on {
  border-color: var(--home-color-primary);
  background: var(--home-color-chip);
  color: var(--home-color-primary);
}

.voice-studio__panel {
  min-height: 0;
}
</style>
