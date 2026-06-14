<script setup lang="ts">
import { computed } from 'vue'

const platform = computed(() => window.electronAPI?.platform ?? 'unknown')
</script>

<template>
  <main class="app">
    <section class="hero">
      <p class="badge">Milestone 0</p>
      <h1>雪澜赛博猫娘</h1>
      <p class="subtitle">Xue_CyberNeko · 桌面 AI 桌宠</p>
      <p class="status">项目骨架已就绪，Vue 窗口运行正常。</p>
      <p class="meta">当前平台：{{ platform }}</p>
    </section>
  </main>
</template>
