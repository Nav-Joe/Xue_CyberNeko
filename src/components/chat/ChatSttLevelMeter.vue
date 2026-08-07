<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  level: number
}>()

const widthPct = computed(() => {
  const n = Number.isFinite(props.level) ? props.level : 0
  const clamped = n < 0 ? 0 : n > 1 ? 1 : n
  return `${Math.round(clamped * 100)}%`
})
</script>

<template>
  <div class="chat-stt-level" aria-hidden="true" title="录音电平">
    <div class="chat-stt-level__track">
      <div class="chat-stt-level__fill" :style="{ width: widthPct }" />
    </div>
  </div>
</template>

<style scoped>
.chat-stt-level {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.chat-stt-level__track {
  width: 96px;
  height: 6px;
  border-radius: 999px;
  background: #fce7f3;
  border: 1px solid #fbcfe8;
  overflow: hidden;
}

.chat-stt-level__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f9a8d4, #db2777);
  transition: width 60ms linear;
}
</style>
