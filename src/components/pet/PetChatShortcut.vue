<script setup lang="ts">
defineProps<{
  disabled?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="pet-chat-shortcut"
    :disabled="disabled"
    aria-label="文字聊天"
    title="文字聊天"
    @click="$emit('click')"
  >
    <!-- 图标风格参考 Heroicons chat-bubble-left-ellipsis (MIT) -->
    <svg class="pet-chat-shortcut__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.913 2.658c3.075-.62 6.157-.62 9.232 0 3.075.621 4.913 2.622 4.913 5.58 0 2.96-1.838 4.96-4.913 5.581-1.512.305-3.024.458-4.616.458-1.003 0-1.968-.064-2.868-.19l-1.71 1.71a.75.75 0 0 1-1.28-.53l.19-1.71c-.126-.9-.19-1.865-.19-2.868 0-1.592.153-3.104.458-4.616.62-3.075 2.622-4.913 5.58-4.913Zm6.616 8.64a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25Zm2.25 0a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25ZM8.25 10.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z"
      />
    </svg>
  </button>
</template>

<style scoped>
.pet-chat-shortcut {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(145deg, rgba(244, 114, 182, 0.96), rgba(190, 24, 93, 0.96));
  box-shadow:
    0 3px 10px rgba(190, 24, 93, 0.32),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(6px);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    filter 0.15s ease;
}

.pet-chat-shortcut:hover:not(:disabled) {
  transform: scale(1.06);
  filter: brightness(1.05);
  box-shadow:
    0 4px 14px rgba(190, 24, 93, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}

.pet-chat-shortcut:active:not(:disabled) {
  transform: scale(0.98);
}

.pet-chat-shortcut:disabled {
  opacity: 0.65;
  cursor: wait;
}

.pet-chat-shortcut__icon {
  width: 15px;
  height: 15px;
}
</style>
