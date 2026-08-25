<script setup lang="ts">
import ChatScreenCompanionVisionSettings from './ChatScreenCompanionVisionSettings.vue'

import { useScreenCompanionSettings } from '../../composables/useScreenCompanionSettings'
import { cloneScreenCompanionConfig } from '../../services/screenCompanion/screenCompanionStore'

import './chat-panel-theme.css'

const emit = defineEmits<{
  changed: []
}>()

/** 顶层解构 ref，模板才能自动解包；嵌在 plain object（如 sc.config）里不会解包 */
const {
  loading,
  saving,
  error,
  statusText,
  config,
  runtime,
  visionApiKeyInput,
  blacklistDraft,
  intervalDraft,
  pausePresetsMin,
  intervalPresets,
  ttsEnabled,
  reload,
  onEnabledToggle,
  onIntervalSave,
  applyIntervalPreset,
  onVisionSave,
  onVisionApiKeySecretSaveToggle,
  onClearVisionKey,
  pauseForMinutes,
  resumePause,
  addBlacklistEntry,
  removeBlacklistEntry,
  formatCompanionRelativeSec,
  formatCompanionPauseUntil
} = useScreenCompanionSettings()

function patchVision(patch: { visionBaseUrl?: string; visionModel?: string }): void {
  if (!config.value) return
  config.value = cloneScreenCompanionConfig({ ...config.value, ...patch })
}

function onVisionKeyInput(value: string): void {
  visionApiKeyInput.value = value
}

async function onVisionSecretSaveChange(value: boolean): Promise<void> {
  if (!config.value) return
  const prev = config.value.visionApiKeySecretSave === true
  config.value = cloneScreenCompanionConfig({
    ...config.value,
    visionApiKeySecretSave: value
  })
  if (await onVisionApiKeySecretSaveToggle()) {
    emit('changed')
    return
  }
  config.value = cloneScreenCompanionConfig({
    ...config.value,
    visionApiKeySecretSave: prev
  })
}

async function onEnableChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const checked = input.checked
  const ok = await onEnabledToggle(checked)
  if (!ok) {
    input.checked = !checked
    return
  }
  emit('changed')
}

async function onVisionSaveAndEmit(): Promise<void> {
  if (await onVisionSave()) emit('changed')
}

async function onIntervalSaveAndEmit(): Promise<void> {
  if (await onIntervalSave()) emit('changed')
}

async function onIntervalPreset(sec: number): Promise<void> {
  if (await applyIntervalPreset(sec)) emit('changed')
}

async function onPauseMin(min: number): Promise<void> {
  if (await pauseForMinutes(min)) emit('changed')
}

defineExpose({
  reload
})
</script>

<template>
  <section class="sc-settings">
    <p class="sc-settings__notice" role="note">
      注意，本功能理论上并不会传播您的屏幕隐私，但如果您因这个功能感到不适，主观认为有隐私泄露风险或电脑有保密数据请勿开启此功能。
    </p>
    <h3 class="chat-theme__section-title">屏幕偷窥</h3>
    <p class="chat-theme__hint sc-settings__privacy">
      开启后，在 Steam 游戏会话中可能截取屏幕并发送至您配置的识图服务，仅生成文字摘要；原图不落盘、不进聊天记录与记忆。旁白使用当前聊天
      LLM，并通过对话 TTS 播放。
    </p>

    <p v-if="loading" class="chat-theme__hint">加载屏幕偷窥配置…</p>
    <p v-if="error" class="chat-theme__error">{{ error }}</p>

    <p v-if="!ttsEnabled" class="chat-theme__error">
      请先在聊天窗口设置的「对话语音」中开启对话 TTS，才能使用屏幕偷窥。
    </p>

    <label class="sc-settings__toggle">
      <input
        type="checkbox"
        :checked="config?.enabled === true"
        :disabled="saving || !ttsEnabled || loading"
        @change="onEnableChange"
      />
      <span>开启屏幕偷窥（Steam 游戏）</span>
    </label>

    <div v-if="runtime" class="sc-settings__status">
      <p>
        <strong>状态：</strong>
        {{
          runtime.sessionActive
            ? `在玩 · ${runtime.playingGameName ?? '?'}`
            : '未在玩'
        }}
        · 调度 {{ runtime.schedulerRunning ? '运行中' : '已停' }}
      </p>
      <p v-if="runtime.paused && runtime.pausedUntilMs">
        看屏暂停至 {{ formatCompanionPauseUntil(runtime.pausedUntilMs) }}
      </p>
      <p v-if="runtime.enabled && runtime.nextObserveAtMs">
        下次循环：{{ formatCompanionRelativeSec(runtime.nextObserveAtMs) }}
      </p>
      <p v-if="runtime.enabled && !runtime.visionConfigured" class="sc-settings__warn">
        视觉 API 未配全，观察将跳过。
      </p>
    </div>

    <template v-if="config">
      <div class="sc-settings__block">
        <label class="chat-theme__label" for="sc-interval">观察间隔（秒）</label>
        <p class="chat-theme__hint">旁白 TTS 播完后开始计时；默认 90 秒。</p>
        <div class="sc-settings__row">
          <input
            id="sc-interval"
            v-model.number="intervalDraft"
            class="chat-theme__input sc-settings__interval-input"
            type="number"
            min="30"
            max="600"
            step="10"
            :disabled="saving || loading"
          />
          <button
            type="button"
            class="chat-theme__btn"
            :disabled="saving || loading"
            @click="onIntervalSaveAndEmit"
          >
            保存间隔
          </button>
        </div>
        <div class="sc-settings__chips">
          <button
            v-for="sec in intervalPresets"
            :key="sec"
            type="button"
            class="sc-settings__chip"
            :disabled="saving || loading"
            @click="onIntervalPreset(sec)"
          >
            {{ sec }}s
          </button>
        </div>
        <p v-if="statusText" class="chat-theme__hint sc-settings__feedback">{{ statusText }}</p>
      </div>
    </template>

    <template v-if="config?.enabled">
      <div class="sc-settings__block">
        <span class="chat-theme__label">暂停看屏</span>
        <div class="sc-settings__row">
          <button
            v-for="min in pausePresetsMin"
            :key="min"
            type="button"
            class="chat-theme__btn chat-theme__btn--ghost"
            :disabled="saving"
            @click="onPauseMin(min)"
          >
            {{ min }} 分钟
          </button>
          <button
            type="button"
            class="chat-theme__btn chat-theme__btn--ghost"
            :disabled="saving"
            @click="resumePause().then(() => emit('changed'))"
          >
            立即恢复
          </button>
        </div>
      </div>

      <ChatScreenCompanionVisionSettings
        :config="config"
        :vision-api-key-input="visionApiKeyInput"
        :has-vision-api-key="config.hasVisionApiKey"
        :vision-api-key-secret-save="config.visionApiKeySecretSave === true"
        :saving="saving"
        @update:vision-api-key-input="onVisionKeyInput"
        @update:config-vision="patchVision"
        @update:vision-api-key-secret-save="onVisionSecretSaveChange"
        @save="onVisionSaveAndEmit"
        @clear-key="onClearVisionKey().then(() => emit('changed'))"
      />

      <div class="sc-settings__block">
        <span class="chat-theme__label">进程黑名单</span>
        <p class="chat-theme__hint">进程名包含以下片段时跳过截屏（非窗口标题）。</p>
        <div class="sc-settings__row">
          <input
            v-model="blacklistDraft"
            class="chat-theme__input"
            type="text"
            placeholder="例如 obs64"
            :disabled="saving"
            @keydown.enter.prevent="addBlacklistEntry().then(() => emit('changed'))"
          />
          <button
            type="button"
            class="chat-theme__btn"
            :disabled="saving"
            @click="addBlacklistEntry().then(() => emit('changed'))"
          >
            添加
          </button>
        </div>
        <ul v-if="config.processBlacklist.length" class="sc-settings__tags">
          <li v-for="item in config.processBlacklist" :key="item">
            <span>{{ item }}</span>
            <button
              type="button"
              aria-label="移除"
              @click="removeBlacklistEntry(item).then(() => emit('changed'))"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sc-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e7ff;
}

.sc-settings__notice {
  margin: 0;
  padding: 10px 12px;
  border: 2px solid #eab308;
  border-radius: 10px;
  background: #fef08a;
  color: #713f12;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.sc-settings__privacy {
  margin: 0;
  line-height: 1.5;
}

.sc-settings__feedback {
  margin: 4px 0 0;
  color: #047857;
  font-weight: 600;
}

.sc-settings__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #c7d2fe;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.sc-settings__toggle input {
  accent-color: #4f46e5;
}

.sc-settings__status {
  padding: 10px 12px;
  border-radius: 10px;
  background: #eef2ff;
  font-size: 12px;
  line-height: 1.5;
  color: #3730a3;
}

.sc-settings__status p {
  margin: 0 0 4px;
}

.sc-settings__status p:last-child {
  margin-bottom: 0;
}

.sc-settings__warn {
  color: #b45309 !important;
}

.sc-settings__block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sc-settings__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sc-settings__interval-input {
  max-width: 120px;
}

.sc-settings__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sc-settings__chip {
  padding: 4px 10px;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}

.sc-settings__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sc-settings__tags li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #e0e7ff;
  font-size: 12px;
}

.sc-settings__tags button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #4338ca;
  font-size: 14px;
  line-height: 1;
}
</style>
