<script setup lang="ts">
defineProps<{
  message: string | null
}>()
</script>

<template>
  <div v-if="message" class="error-boundary" role="alert">
    <p class="error-boundary__title">启动异常</p>
    <p class="error-boundary__message">{{ message }}</p>
  </div>
</template>

<style scoped>
.error-boundary {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 28, 0.92);
  color: #f5f5f5;
  text-align: center;
}

.error-boundary__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.error-boundary__message {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}
</style>
