<script setup lang="ts">
const props = defineProps<{
  title: string
  message: string
  progress?: { done: number; total: number } | null
}>()

function progressPercent(): number {
  if (!props.progress || props.progress.total <= 0) {
    return 0
  }
  return Math.min(100, Math.round((props.progress.done / props.progress.total) * 100))
}

const showDeterminate = (): boolean => Boolean(props.progress && props.progress.total > 0)
</script>

<template>
  <div class="engine-load-shell">
    <div class="engine-load-card">
      <h3 class="engine-load-title">{{ title }}</h3>
      <p class="engine-load-message">{{ message }}</p>

      <div v-if="showDeterminate()" class="progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercent()}%` }" />
        </div>
        <p class="engine-load-progress">{{ progress!.done }} / {{ progress!.total }}</p>
      </div>
      <div v-else class="progress-wrap">
        <div class="progress-bar progress-bar--indeterminate">
          <div class="progress-fill progress-fill--indeterminate" />
        </div>
        <p class="engine-load-progress">请稍候…</p>
      </div>

      <p class="engine-load-hint">桌宠已隐藏，加载完成前不会响应触摸。请勿关闭 TTS 窗口。</p>
    </div>
  </div>
</template>

<style scoped>
.engine-load-shell {
  position: fixed;
  inset: 0;
  z-index: 180;
  background: transparent;
  pointer-events: auto;
}

.engine-load-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 22px 18px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  overflow: hidden;
}

.engine-load-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  text-align: center;
}

.engine-load-message {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: #4b5563;
  text-align: center;
}

.progress-wrap {
  margin-bottom: 12px;
}

.progress-bar {
  height: 10px;
  border-radius: 999px;
  background: #f3f4f6;
  overflow: hidden;
}

.progress-bar--indeterminate {
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.35s ease;
}

.progress-fill--indeterminate {
  width: 40% !important;
  animation: indeterminate 1.2s ease-in-out infinite;
}

.engine-load-progress {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.engine-load-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: #9ca3af;
  text-align: center;
}

@keyframes indeterminate {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(260%);
  }
}
</style>
