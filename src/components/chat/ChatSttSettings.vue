<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadChatConfigView, saveChatSttSettings } from '../../services/chat/chatConfigStore'
import {
  getCachedMicDevices,
  listMicDevices,
  type MicDeviceInfo,
  warmMicDevicesInBackground
} from '../../services/stt/micDevices'
import {
  ensureSttServiceFromMain,
  stopManagedSttServiceFromMain
} from '../../services/stt/sttLifecycle'

import './chat-panel-theme.css'

const emit = defineEmits<{
  changed: []
}>()

const sttEnabled = ref(false)
const sttAutoSend = ref(false)
const sttDeviceId = ref('')
const micDevices = ref<MicDeviceInfo[]>([])
const micScanning = ref(false)
const saving = ref(false)
const status = ref('')
const error = ref('')

async function refreshMicList(requestPermission: boolean): Promise<void> {
  micScanning.value = true
  try {
    micDevices.value = await listMicDevices({ requestPermission })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '枚举麦克风失败'
  } finally {
    micScanning.value = false
  }
}

onMounted(async () => {
  micDevices.value = getCachedMicDevices()
  void warmMicDevicesInBackground().then((list) => {
    if (list.length > 0) micDevices.value = list
  })

  try {
    const config = await loadChatConfigView()
    sttEnabled.value = config.sttEnabled === true
    sttAutoSend.value = config.sttAutoSend === true
    sttDeviceId.value = config.sttDeviceId ?? ''
    if (sttEnabled.value) {
      await refreshMicList(true)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载语音输入设置失败'
  }
})

async function persist(
  partial: Parameters<typeof saveChatSttSettings>[0],
  okMessage: string
): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  status.value = ''
  try {
    await saveChatSttSettings(partial)
    status.value = okMessage
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function onEnabledToggle(): Promise<void> {
  if (!sttEnabled.value) {
    sttAutoSend.value = false
    await persist(
      { sttEnabled: false, sttAutoSend: false },
      '已关闭语音输入'
    )
    await stopManagedSttServiceFromMain()
    return
  }

  saving.value = true
  error.value = ''
  status.value = '正在启动语音服务…'
  try {
    await saveChatSttSettings({
      sttEnabled: true,
      sttAutoSend: sttAutoSend.value,
      sttDeviceId: sttDeviceId.value
    })
    emit('changed')
    await refreshMicList(true)
    const ensured = await ensureSttServiceFromMain()
    if (!ensured.ok) {
      error.value = ensured.detail
      status.value = '语音输入已开启，但服务未就绪'
      return
    }
    status.value = ensured.reused
      ? '已开启语音输入（复用已运行的服务）'
      : '已开启语音输入（服务已启动）'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '开启语音输入失败'
    status.value = ''
  } finally {
    saving.value = false
  }
}

async function onAutoSendToggle(): Promise<void> {
  await persist(
    { sttAutoSend: sttAutoSend.value },
    sttAutoSend.value ? '识别后将自动发送' : '识别后追加到输入框'
  )
}

async function onDeviceChange(): Promise<void> {
  const label =
    !sttDeviceId.value.trim()
      ? '系统默认'
      : micDevices.value.find((d) => d.deviceId === sttDeviceId.value)?.label || '所选麦克风'
  await persist({ sttDeviceId: sttDeviceId.value }, `麦克风已设为：${label}`)
}

async function onRefreshMics(): Promise<void> {
  error.value = ''
  await refreshMicList(true)
  status.value =
    micDevices.value.length > 0
      ? `已检测到 ${micDevices.value.length} 个麦克风`
      : '未检测到麦克风（请检查权限与设备）'
}
</script>

<template>
  <section class="chat-stt-settings">
    <h3 class="chat-theme__section-title">语音输入</h3>
    <label class="chat-stt-settings__toggle">
      <input v-model="sttEnabled" type="checkbox" :disabled="saving" @change="onEnabledToggle" />
      <span>开启语音输入（STT）</span>
    </label>

    <div v-if="sttEnabled" class="chat-stt-settings__sub">
      <label class="chat-stt-settings__toggle">
        <input
          v-model="sttAutoSend"
          type="checkbox"
          :disabled="saving"
          @change="onAutoSendToggle"
        />
        <span>识别后自动发送</span>
      </label>
      <p class="chat-theme__hint">关闭时，识别文字会追加到输入框，可再编辑后发送。</p>

      <div class="chat-stt-settings__device">
        <div class="chat-stt-settings__device-row">
          <span class="chat-stt-settings__mic-icon" aria-hidden="true" title="麦克风">
            <!-- Heroicons microphone (MIT) -->
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Zm7 10a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z"
              />
            </svg>
          </span>
          <label class="chat-stt-settings__sr-only" for="chat-stt-mic-select">麦克风</label>
          <select
            id="chat-stt-mic-select"
            v-model="sttDeviceId"
            class="chat-stt-settings__select"
            :disabled="saving || micScanning"
            @change="onDeviceChange"
          >
            <option value="">系统默认</option>
            <option
              v-if="sttDeviceId && !micDevices.some((d) => d.deviceId === sttDeviceId)"
              :value="sttDeviceId"
            >
              已保存的麦克风（当前未检测到）
            </option>
            <option
              v-for="device in micDevices"
              :key="device.deviceId"
              :value="device.deviceId"
            >
              {{ device.label }}
            </option>
          </select>
          <button
            type="button"
            class="chat-stt-settings__refresh"
            :disabled="saving || micScanning"
            @click="onRefreshMics"
          >
            {{ micScanning ? '检测中…' : '重新检测' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="status" class="chat-theme__hint" role="status">{{ status }}</p>
    <p v-if="error" class="chat-theme__error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.chat-stt-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-stt-settings__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}

.chat-stt-settings__sub {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-left: 4px;
  padding-left: 12px;
  border-left: 3px solid #fbcfe8;
}

.chat-stt-settings__device {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-stt-settings__device-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.chat-stt-settings__mic-icon {
  display: inline-flex;
  color: #9d174d;
  flex-shrink: 0;
}

.chat-stt-settings__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.chat-stt-settings__select {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #fbcfe8;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font-size: 13px;
}

.chat-stt-settings__refresh {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid #f9a8d4;
  border-radius: 999px;
  background: #fff;
  color: #9d174d;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.chat-stt-settings__refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
