<script setup lang="ts">
import type { BootStep } from '../constants/petBoot'

const props = defineProps<{
  message: string
  steps: BootStep[]
  currentStepId: string
  progress?: { done: number; total: number } | null
}>()

function stepIndex(stepId: string): number {
  return props.steps.findIndex((step) => step.id === stepId)
}

function stepState(stepId: string): 'done' | 'active' | 'pending' {
  const current = stepIndex(props.currentStepId)
  const index = stepIndex(stepId)
  if (index < 0 || current < 0) {
    return 'pending'
  }
  if (index < current) {
    return 'done'
  }
  if (index === current) {
    return 'active'
  }
  return 'pending'
}

function progressPercent(): number {
  if (!props.progress || props.progress.total <= 0) {
    return 0
  }
  return Math.min(100, Math.round((props.progress.done / props.progress.total) * 100))
}
</script>

<template>
  <div class="boot-shell">
    <div class="boot-card">
      <h3 class="boot-title">准备中</h3>
      <ol class="step-list">
        <li
          v-for="step in steps"
          :key="step.id"
          class="step-item"
          :class="`step-item--${stepState(step.id)}`"
        >
          <span class="step-marker" aria-hidden="true">
            <span v-if="stepState(step.id) === 'done'">✓</span>
            <span v-else-if="stepState(step.id) === 'active'" class="step-spinner" />
            <span v-else>·</span>
          </span>
          <span class="step-label">{{ step.label }}</span>
        </li>
      </ol>

      <p class="boot-message">{{ message }}</p>

      <div v-if="progress && progress.total > 0" class="progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercent()}%` }" />
        </div>
        <p class="boot-progress">{{ progress.done }} / {{ progress.total }}</p>
      </div>

      <p class="boot-hint">桌宠已隐藏，完成前不会响应触摸。请勿关闭 TTS 窗口。</p>
    </div>
  </div>
</template>

<style scoped>
.boot-shell {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: transparent;
  pointer-events: auto;
}

.boot-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 20px 18px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  overflow: hidden;
}

.boot-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  text-align: center;
}

.step-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #9ca3af;
}

.step-item--active {
  color: #111827;
  font-weight: 600;
}

.step-item--done {
  color: #059669;
}

.step-marker {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(236, 72, 153, 0.2);
  border-top-color: #ec4899;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.boot-message {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
  text-align: center;
}

.progress-wrap {
  margin-bottom: 10px;
}

.progress-bar {
  height: 8px;
  border-radius: 999px;
  background: #f3f4f6;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ec4899, #f472b6);
  transition: width 0.35s ease;
}

.boot-progress {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.boot-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: #9ca3af;
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
