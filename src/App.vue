<script setup lang="ts">
import Live2DView from './components/Live2DView.vue'
</script>

<template>
  <main class="app">
    <header class="title-bar">
      <h1>雪澜赛博猫娘</h1>
      <p>Milestone 1 · Live2D</p>
    </header>
    <Live2DView class="stage" />
  </main>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #fdf2f8 0%, #f8fafc 45%, #eff6ff 100%);
}

.title-bar {
  flex-shrink: 0;
  padding: 12px 20px 8px;
  text-align: center;
}

.title-bar h1 {
  margin: 0;
  font-size: 20px;
  color: #111827;
}

.title-bar p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
  letter-spacing: 0.06em;
}

.stage {
  flex: 1;
  min-height: 0;
}
</style>
