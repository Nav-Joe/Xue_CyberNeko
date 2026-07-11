<script setup lang="ts">
import { computeDownloadPercent, formatDownloadProgressText } from '../../utils/formatBytes'

defineProps<{
  title: string
  message: string
  progress?: { done: number; total: number } | null
}>()

function hasDownloadProgress(progress: { done: number; total: number } | null | undefined): boolean {
  return Boolean(progress && (progress.total > 0 || progress.done > 0))
}

function progressPercent(progress: { done: number; total: number } | null | undefined): number {
  if (!progress) return 0
  return computeDownloadPercent(progress.done, progress.total)
}
</script>

<template>
  <div class="chat-boot">
    <div class="chat-boot__card">
      <p class="chat-boot__badge">文字聊天</p>
      <h3 class="chat-boot__title">{{ title }}</h3>
      <p class="chat-boot__message">{{ message }}</p>

      <div v-if="hasDownloadProgress(progress)" class="chat-boot__progress-wrap">
        <p v-if="progress && progress.total > 0" class="chat-boot__percent">{{ progressPercent(progress) }}%</p>
        <div class="chat-boot__progress-bar">
          <div
            class="chat-boot__progress-fill"
            :class="{ 'chat-boot__progress-fill--unknown': !progress?.total }"
            :style="{
              width: progress?.total
                ? `${progressPercent(progress)}%`
                : progress?.done
                  ? '66%'
                  : '0%'
            }"
          />
        </div>
        <p class="chat-boot__progress-text">
          {{ formatDownloadProgressText(progress?.done ?? 0, progress?.total ?? 0) }}
        </p>
      </div>
      <div v-else class="chat-boot__progress-wrap">
        <div class="chat-boot__progress-bar chat-boot__progress-bar--indeterminate">
          <div class="chat-boot__progress-fill chat-boot__progress-fill--indeterminate" />
        </div>
        <p class="chat-boot__progress-text">请稍候…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-boot {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(253, 242, 248, 0.72);
  backdrop-filter: blur(4px);
}

.chat-boot__card {
  width: min(360px, calc(100vw - 40px));
  padding: 22px 20px 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #fbcfe8;
  box-shadow: 0 16px 48px rgba(190, 24, 93, 0.18);
}

.chat-boot__badge {
  display: inline-block;
  margin: 0 0 10px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fce7f3;
  color: #be185d;
  font-size: 11px;
  font-weight: 700;
}

.chat-boot__title {
  margin: 0 0 8px;
  font-size: 18px;
  color: #111827;
}

.chat-boot__message {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: #6b7280;
}

.chat-boot__progress-wrap {
  margin-top: 4px;
}

.chat-boot__percent {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: #be185d;
  text-align: center;
}

.chat-boot__progress-bar {
  height: 10px;
  border-radius: 999px;
  background: #fce7f3;
  overflow: hidden;
}

.chat-boot__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f472b6, #be185d);
  transition: width 0.25s ease;
}

.chat-boot__progress-fill--unknown {
  animation: chat-boot-pulse 1.4s ease-in-out infinite;
}

.chat-boot__progress-bar--indeterminate .chat-boot__progress-fill--indeterminate {
  width: 40%;
  animation: chat-boot-slide 1.2s ease-in-out infinite;
}

.chat-boot__progress-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9d174d;
  text-align: center;
}

@keyframes chat-boot-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}

@keyframes chat-boot-pulse {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
</style>
