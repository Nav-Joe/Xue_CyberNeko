<script setup lang="ts">
defineProps<{
  dark: boolean
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="theme-bulb"
    :class="{ 'theme-bulb--on': dark }"
    :aria-label="dark ? '切换为浅色模式' : '切换为深色模式'"
    :title="dark ? '切换为浅色模式' : '切换为深色模式'"
    @click="$emit('toggle')"
  >
    <svg class="theme-bulb__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 21h6m-7-4h8M8.2 13.2A5.8 5.8 0 1 1 15.8 13.2C14.7 14.4 14 15.7 14 17H10c0-1.3-.7-2.6-1.8-3.8Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<style scoped>
.theme-bulb {
  position: fixed;
  top: 12px;
  right: 14px;
  z-index: 30;
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--home-line, rgba(63, 42, 51, 0.12));
  border-radius: 999px;
  background: var(--home-color-surface, rgba(255, 252, 250, 0.92));
  color: var(--home-color-primary, #9f1239);
  cursor: pointer;
  box-shadow: var(--home-shadow, 0 8px 16px rgba(63, 42, 51, 0.1));
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.theme-bulb:hover {
  transform: translateY(-1px) rotate(-8deg);
}

.theme-bulb:focus-visible {
  outline: 2px solid var(--home-focus, #9f1239);
  outline-offset: 3px;
}

.theme-bulb--on {
  background: rgba(36, 21, 42, 0.94);
  border-color: rgba(251, 191, 36, 0.5);
  color: #fbbf24;
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.22), 0 8px 18px rgba(15, 23, 42, 0.35);
}

.theme-bulb__icon {
  width: 20px;
  height: 20px;
  display: block;
}

.theme-bulb--on .theme-bulb__icon path {
  fill: rgba(251, 191, 36, 0.3);
}
</style>
