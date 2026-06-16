<script setup lang="ts">
defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  action: [action: 'home' | 'quit']
  close: []
}>()
</script>

<template>
  <nav class="menu" :style="{ left: `${x}px`, top: `${y}px` }" @click.stop>
    <button type="button" class="item" @click="emit('action', 'home')">🏠 回家</button>
    <button type="button" class="item muted" disabled>⚙️ 设置（敬请期待）</button>
    <button type="button" class="item danger" @click="emit('action', 'quit')">退出</button>
  </nav>
</template>

<style scoped>
.menu {
  position: fixed;
  z-index: 100;
  min-width: 160px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(12px);
}

.item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #1f2937;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.item:hover:not(:disabled) {
  background: #fdf2f8;
}

.item.muted {
  color: #9ca3af;
  cursor: not-allowed;
}

.item.danger {
  color: #b91c1c;
}

.item.danger:hover {
  background: #fef2f2;
}
</style>
