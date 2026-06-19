<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { applyVolumeToCurrentAudio } from '../services/ttsPlayer'
import { getTtsVolume, setTtsVolume } from '../services/ttsVolume'

const volume = ref(getTtsVolume())

function syncFromStorage(): void {
  volume.value = getTtsVolume()
}

function onVolumeInput(): void {
  setTtsVolume(volume.value)
  applyVolumeToCurrentAudio()
}

watch(volume, onVolumeInput)

onMounted(() => {
  window.addEventListener('tts-volume-changed', syncFromStorage as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('tts-volume-changed', syncFromStorage as EventListener)
})
</script>

<template>
  <label class="volume">
    <span class="label">语音音量</span>
    <input v-model.number="volume" type="range" min="0" max="1" step="0.05" />
    <span class="value">{{ Math.round(volume * 100) }}%</span>
  </label>
</template>

<style scoped>
.volume {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.label {
  flex-shrink: 0;
  font-size: 13px;
  color: #4b5563;
}

input[type='range'] {
  flex: 1;
  accent-color: #db2777;
}

.value {
  flex-shrink: 0;
  width: 42px;
  font-size: 12px;
  color: #6b7280;
  text-align: right;
}
</style>
