import { onMounted, onUnmounted, ref } from 'vue'

import { loadChatConfigView } from '../services/chat/chatConfigStore'
import {
  clampIntervalSecUi,
  disableScreenCompanionIfEnabled,
  fetchScreenCompanionStatus,
  formatCompanionPauseUntil,
  formatCompanionRelativeSec,
  loadScreenCompanionConfig,
  saveScreenCompanionConfig,
  type ScreenCompanionRuntimeStatus
} from '../services/screenCompanion/screenCompanionStore'
import type { ScreenCompanionConfigView } from '../services/screenCompanion/types'

const PAUSE_PRESETS_MIN = [15, 30, 60] as const
const INTERVAL_PRESETS = [30, 60, 90, 120, 180, 300] as const

export function useScreenCompanionSettings() {
  const ttsEnabled = ref(true)
  const loading = ref(true)
  const saving = ref(false)
  const error = ref('')
  const statusText = ref('')
  const config = ref<ScreenCompanionConfigView | null>(null)
  const runtime = ref<ScreenCompanionRuntimeStatus | null>(null)
  const visionApiKeyInput = ref('')
  const blacklistDraft = ref('')
  const intervalDraft = ref(90)

  let unsubSession: (() => void) | null = null
  let statusTimer: ReturnType<typeof setInterval> | null = null

  function syncVisionApiKeyInputFromConfig(): void {
    if (!config.value) {
      visionApiKeyInput.value = ''
      return
    }
    visionApiKeyInput.value =
      !config.value.visionApiKeySecretSave && config.value.visionApiKey
        ? config.value.visionApiKey
        : ''
  }

  async function refreshStatus(): Promise<void> {
    runtime.value = await fetchScreenCompanionStatus()
  }

  async function refreshTtsFlag(): Promise<void> {
    try {
      const chat = await loadChatConfigView()
      ttsEnabled.value = chat.ttsEnabled !== false
    } catch {
      ttsEnabled.value = true
    }
  }

  async function reload(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await refreshTtsFlag()
      config.value = await loadScreenCompanionConfig()
      intervalDraft.value = clampIntervalSecUi(config.value.intervalSec)
      syncVisionApiKeyInputFromConfig()
      await refreshStatus()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function persist(
    patch: Partial<ScreenCompanionConfigView> & {
      visionApiKey?: string
      clearVisionApiKey?: boolean
    },
    okMessage: string
  ): Promise<boolean> {
    if (!config.value || saving.value) {
      if (!config.value) {
        error.value = '配置尚未加载，请稍后再试'
      }
      return false
    }
    saving.value = true
    error.value = ''
    statusText.value = ''
    try {
      const next: ScreenCompanionConfigView & {
        visionApiKey?: string
        clearVisionApiKey?: boolean
      } = {
        ...config.value,
        ...patch,
        intervalSec: clampIntervalSecUi(patch.intervalSec ?? intervalDraft.value)
      }
      if (patch.enabled === true && !ttsEnabled.value) {
        throw new Error('须先在「对话语音」中开启对话 TTS')
      }
      if (typeof patch.visionApiKey === 'string' && patch.visionApiKey.trim()) {
        next.visionApiKey = patch.visionApiKey.trim()
      }
      config.value = await saveScreenCompanionConfig(next)
      intervalDraft.value = config.value.intervalSec
      syncVisionApiKeyInputFromConfig()
      statusText.value = okMessage
      await refreshStatus()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function onCompanionTtsDeviceChange(device: 'cpu' | 'gpu'): Promise<boolean> {
    return persist(
      { companionTtsDevice: device },
      device === 'gpu' ? '旁白 TTS 已切换为 GPU' : '旁白 TTS 已切换为 CPU'
    )
  }

  async function onEnabledToggle(enabled: boolean): Promise<boolean> {
    return persist({ enabled }, enabled ? '已开启屏幕偷窥' : '已关闭屏幕偷窥')
  }

  async function onIntervalSave(explicitSec?: number): Promise<boolean> {
    const sec = clampIntervalSecUi(explicitSec ?? intervalDraft.value)
    intervalDraft.value = sec
    return persist({ intervalSec: sec }, `观察间隔已设为 ${sec} 秒`)
  }

  async function applyIntervalPreset(sec: number): Promise<boolean> {
    return onIntervalSave(sec)
  }

  async function onVisionSave(): Promise<boolean> {
    if (!config.value) return false
    const key = visionApiKeyInput.value.trim()
    return persist(
      {
        visionBaseUrl: config.value.visionBaseUrl,
        visionModel: config.value.visionModel,
        visionApiKeySecretSave: config.value.visionApiKeySecretSave === true,
        ...(key ? { visionApiKey: key } : {})
      },
      '视觉识图配置已保存'
    )
  }

  async function onVisionApiKeySecretSaveToggle(): Promise<boolean> {
    if (!config.value) return false
    const nextSecret = config.value.visionApiKeySecretSave === true
    const ok = await persist(
      { visionApiKeySecretSave: nextSecret },
      nextSecret ? '已开启视觉 API Key 私密保存' : '已关闭视觉 API Key 私密保存'
    )
    return ok
  }

  async function onClearVisionKey(): Promise<void> {
    await persist({ clearVisionApiKey: true }, '已清除视觉 API Key')
  }

  async function pauseForMinutes(minutes: number): Promise<void> {
    const until = Date.now() + minutes * 60_000
    await persist({ pausedUntilMs: until }, `已暂停看屏至 ${formatCompanionPauseUntil(until)}`)
  }

  async function resumePause(): Promise<void> {
    await persist({ pausedUntilMs: null }, '已恢复看屏')
  }

  async function addBlacklistEntry(): Promise<void> {
    if (!config.value) return
    const entry = blacklistDraft.value.trim()
    if (!entry) return
    const list = [...config.value.processBlacklist]
    if (list.some((x) => x.toLowerCase() === entry.toLowerCase())) {
      blacklistDraft.value = ''
      return
    }
    list.push(entry)
    blacklistDraft.value = ''
    await persist({ processBlacklist: list }, `已加入黑名单：${entry}`)
  }

  async function removeBlacklistEntry(entry: string): Promise<void> {
    if (!config.value) return
    const list = config.value.processBlacklist.filter((x) => x !== entry)
    await persist({ processBlacklist: list }, '已更新进程黑名单')
  }

  onMounted(() => {
    void reload()
    unsubSession = window.electronAPI?.screenCompanionOnSession?.(() => {
      void refreshStatus()
    }) ?? null
    statusTimer = setInterval(() => {
      if (config.value?.enabled) void refreshStatus()
    }, 10_000)
  })

  onUnmounted(() => {
    unsubSession?.()
    unsubSession = null
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = null
  })

  return {
    loading,
    saving,
    error,
    statusText,
    config,
    runtime,
    visionApiKeyInput,
    blacklistDraft,
    intervalDraft,
    pausePresetsMin: PAUSE_PRESETS_MIN,
    intervalPresets: INTERVAL_PRESETS,
    ttsEnabled,
    reload,
    onEnabledToggle,
    onCompanionTtsDeviceChange,
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
    formatCompanionPauseUntil,
    disableScreenCompanionIfEnabled
  }
}
