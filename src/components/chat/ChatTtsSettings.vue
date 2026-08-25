<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadChatConfigView, saveChatTtsSettings } from '../../services/chat/chatConfigStore'
import { disableScreenCompanionIfEnabled } from '../../services/screenCompanion/screenCompanionStore'
import type { ChatTtsParallelLanes } from '../../services/chat/types'

import './chat-panel-theme.css'

const PARALLEL_LANE_OPTIONS: ChatTtsParallelLanes[] = [2, 3, 4]

const emit = defineEmits<{
  changed: []
}>()

const ttsEnabled = ref(true)
const ttsParallelEnabled = ref(false)
const ttsParallelLanes = ref<ChatTtsParallelLanes>(2)
const saving = ref(false)
const status = ref('')
const error = ref('')

onMounted(async () => {
  try {
    const config = await loadChatConfigView()
    ttsEnabled.value = config.ttsEnabled !== false
    ttsParallelEnabled.value = config.ttsParallelEnabled === true
    ttsParallelLanes.value = config.ttsParallelLanes ?? 2
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载 TTS 设置失败'
  }
})

async function persist(partial: Parameters<typeof saveChatTtsSettings>[0], okMessage: string): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  status.value = ''
  try {
    await saveChatTtsSettings(partial)
    status.value = okMessage
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function onTtsToggle(): Promise<void> {
  const turningOff = !ttsEnabled.value
  await persist(
    { ttsEnabled: ttsEnabled.value },
    ttsEnabled.value ? '已开启对话 TTS' : '已关闭对话 TTS'
  )
  if (turningOff) {
    const companionOff = await disableScreenCompanionIfEnabled()
    if (companionOff) {
      status.value = '已关闭对话 TTS；屏幕偷窥总开关已一并关闭'
      emit('changed')
    }
  }
}

async function onParallelToggle(): Promise<void> {
  await persist(
    { ttsParallelEnabled: ttsParallelEnabled.value },
    ttsParallelEnabled.value ? '已开启并行 TTS 推理' : '已关闭并行 TTS 推理'
  )
}

async function onLanesChange(): Promise<void> {
  await persist({ ttsParallelLanes: ttsParallelLanes.value }, `并路已设为 ${ttsParallelLanes.value}`)
}
</script>

<template>
  <section class="chat-tts-settings">
    <h3 class="chat-theme__section-title">对话语音</h3>
    <p class="chat-theme__hint">开启后，助手回复将按句朗读并对 Live2D 口型；修改后会自动保存。</p>
    <label class="chat-tts-settings__toggle">
      <input v-model="ttsEnabled" type="checkbox" :disabled="saving" @change="onTtsToggle" />
      <span>开启对话 TTS</span>
    </label>

    <div v-if="ttsEnabled" class="chat-tts-settings__parallel">
      <div class="chat-tts-settings__parallel-head">
        <span class="chat-tts-settings__parallel-title">并行 TTS 推理模式</span>
        <span class="chat-tts-settings__help" tabindex="0" aria-label="显存与并路推荐">
          ?
          <span class="chat-tts-settings__tooltip" role="tooltip">
            <strong>显存与并路推荐</strong>
            <p class="chat-tts-settings__tooltip-intro">
              开启该功能后能够加快TTS服务，并行并路越多，效率相对越快
            </p>
            <table class="chat-tts-settings__tooltip-table">
              <thead>
                <tr>
                  <th>显存</th>
                  <th>建议并路</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>&lt; 8GB</td>
                  <td>请勿开启</td>
                </tr>
                <tr>
                  <td>8GB</td>
                  <td>不建议 / 最多 2</td>
                </tr>
                <tr>
                  <td>12GB</td>
                  <td>2–3</td>
                </tr>
                <tr>
                  <td>16GB 及以上</td>
                  <td>3–4</td>
                </tr>
              </tbody>
            </table>
            <span class="chat-tts-settings__tooltip-note">默认串行模式更安全；并行可缩短多句回复的等待时间。</span>
          </span>
        </span>
      </div>

      <label class="chat-tts-settings__toggle">
        <input
          v-model="ttsParallelEnabled"
          type="checkbox"
          :disabled="saving"
          @change="onParallelToggle"
        />
        <span>开启并行 TTS 推理</span>
      </label>
      <p class="chat-tts-settings__vram-warn">❗️如果您的显存小于 8GB 请勿开启</p>

      <template v-if="ttsParallelEnabled">
        <label class="chat-theme__label" for="tts-parallel-lanes">并行并路</label>
        <select
          id="tts-parallel-lanes"
          v-model.number="ttsParallelLanes"
          class="chat-theme__select chat-tts-settings__lanes"
          :disabled="saving"
          @change="onLanesChange"
        >
          <option v-for="lane in PARALLEL_LANE_OPTIONS" :key="lane" :value="lane">
            {{ lane }} 路
          </option>
        </select>

        <div class="chat-tts-settings__notice">
          <p class="chat-tts-settings__notice-title">注意⚠️：太高并路会导致爆显存，可以按照以下标准来选择：</p>
          <ul class="chat-tts-settings__notice-list">
            <li><strong>8GB</strong> → 不建议开启</li>
            <li><strong>12GB</strong> → 并路 2–3</li>
            <li><strong>16GB 及以上</strong> → 并路 3–4</li>
          </ul>
        </div>
      </template>
    </div>

    <p v-if="status" class="chat-theme__hint">{{ status }}</p>
    <p v-if="error" class="chat-theme__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.chat-tts-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid #fdf2f8;
}

.chat-tts-settings__toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 12px;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.chat-tts-settings__toggle input {
  accent-color: #db2777;
}

.chat-tts-settings__parallel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed #fbcfe8;
  border-radius: 12px;
  background: #fffafb;
}

.chat-tts-settings__parallel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: visible;
}

.chat-tts-settings__parallel-title {
  font-size: 13px;
  font-weight: 600;
  color: #9d174d;
}

.chat-tts-settings__help {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #fce7f3;
  color: #be185d;
  font-size: 12px;
  font-weight: 700;
  cursor: help;
  user-select: none;
}

.chat-tts-settings__help:focus-visible {
  outline: 2px solid #f9a8d4;
  outline-offset: 1px;
}

.chat-tts-settings__tooltip {
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  z-index: 20;
  display: none;
  width: max-content;
  max-width: 260px;
  padding: 10px 12px;
  border: 1px solid #fbcfe8;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(190, 24, 93, 0.12);
  color: #374151;
  font-size: 12px;
  line-height: 1.45;
  transform: translateX(-50%);
  pointer-events: none;
}

.chat-tts-settings__help:hover .chat-tts-settings__tooltip,
.chat-tts-settings__help:focus .chat-tts-settings__tooltip,
.chat-tts-settings__help:focus-within .chat-tts-settings__tooltip {
  display: block;
}

.chat-tts-settings__tooltip strong {
  display: block;
  margin-bottom: 6px;
  color: #9d174d;
}

.chat-tts-settings__tooltip-intro {
  margin: 0 0 8px;
  color: #4b5563;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 500;
}

.chat-tts-settings__tooltip-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 6px;
  font-size: 11px;
}

.chat-tts-settings__tooltip-table th,
.chat-tts-settings__tooltip-table td {
  padding: 3px 6px;
  border-bottom: 1px solid #fce7f3;
  text-align: left;
}

.chat-tts-settings__tooltip-note {
  color: #9ca3af;
  font-size: 11px;
}

.chat-tts-settings__vram-warn {
  margin: 0;
  padding-left: 2px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.45;
}

.chat-tts-settings__lanes {
  max-width: 160px;
}

.chat-tts-settings__notice {
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}

.chat-tts-settings__notice-title {
  margin: 0 0 6px;
  color: #9a3412;
  font-size: 12px;
  line-height: 1.5;
}

.chat-tts-settings__notice-list {
  margin: 0;
  padding-left: 18px;
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.55;
}
</style>
