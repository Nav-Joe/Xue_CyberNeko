<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  OFFICIAL_CURATED_CLIPS_EMPTY_MESSAGE,
  OFFICIAL_CURATED_CLIPS_EMPTY_TITLE,
  OFFICIAL_CURATED_CLIPS_HINT,
  OFFICIAL_CURATED_CLIPS_LABEL,
  OFFICIAL_CURATED_CLIPS_NEED_OFFICIAL_HINT
} from '../constants/voiceForge'
import { setRuntimeCorpus } from '../services/corpus'
import { setRealtimeInferenceEnabled } from '../services/ttsSettings'
import { setTouchFeedbackMode } from '../services/touchModeSettings'

const canUse = ref(true)
const useCuratedClips = ref(true)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

async function showEmptyCacheDialog(): Promise<void> {
  if (window.electronAPI?.showConfirmDialog) {
    await window.electronAPI.showConfirmDialog({
      title: OFFICIAL_CURATED_CLIPS_EMPTY_TITLE,
      message: OFFICIAL_CURATED_CLIPS_EMPTY_MESSAGE,
      confirmLabel: '知道了'
    })
    return
  }
  window.alert(OFFICIAL_CURATED_CLIPS_EMPTY_MESSAGE)
}

async function refreshState(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.readVoiceForgeConfig) {
      canUse.value = false
      return
    }
    const config = await window.electronAPI.readVoiceForgeConfig()
    const active = config.activeSample
    const isOfficial =
      !active ||
      active.folderId === 'default_sample' ||
      active.kind === 'official'
    canUse.value = isOfficial
    useCuratedClips.value = config.officialUseCuratedClips !== false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取配置失败'
    canUse.value = false
  } finally {
    loading.value = false
  }
}

async function handleToggle(): Promise<void> {
  if (saving.value || loading.value || !canUse.value) {
    return
  }

  const next = !useCuratedClips.value
  saving.value = true
  error.value = ''

  try {
    if (!next) {
      if (!window.electronAPI?.checkOfficialTouchCacheReady) {
        throw new Error('当前环境不支持检测预热缓存')
      }
      const cache = await window.electronAPI.checkOfficialTouchCacheReady()
      if (!cache.ready) {
        useCuratedClips.value = true
        error.value = OFFICIAL_CURATED_CLIPS_EMPTY_MESSAGE
        await showEmptyCacheDialog()
        return
      }
    }

    if (!window.electronAPI?.setOfficialTouchPlayback) {
      throw new Error('当前环境不支持切换触摸音频来源')
    }
    const result = await window.electronAPI.setOfficialTouchPlayback(next)
    useCuratedClips.value = result.officialUseCuratedClips
    setTouchFeedbackMode(result.touchMode)

    if (result.officialUseCuratedClips) {
      setRealtimeInferenceEnabled(false)
    }

    if (window.electronAPI.readVoiceForgeConfig) {
      const config = await window.electronAPI.readVoiceForgeConfig()
      if (result.touchMode === 'custom_corpus') {
        setRuntimeCorpus(config.corpus)
      }
    }

    if (result.touchMode === 'custom_corpus') {
      window.dispatchEvent(new CustomEvent('pet-settings-close'))
    }

    if (!window.electronAPI.beginVoiceEngineLoad) {
      throw new Error('当前环境不支持语音引擎加载')
    }

    let loadMode: 'curated' | 'engine' | 'prewarm' = 'curated'
    if (result.touchMode === 'custom_corpus') {
      // 关闭「非语料库音频」前已校验磁盘预热缓存；只需等克隆引擎挂载，不必再等 prewarm 轮询卡死
      loadMode = 'engine'
    }

    const loadResult = await window.electronAPI.beginVoiceEngineLoad({
      title: result.touchMode === 'curated' ? '切换精选音频' : '切换语料库',
      message:
        result.touchMode === 'curated'
          ? '正在切换为精选触摸音频…'
          : '正在切换使用语料库喵~',
      mode: loadMode,
      expectedTouchMode: result.touchMode,
      syncMessage: result.touchMode === 'custom_corpus' ? '正在切换使用语料库喵~' : undefined
    })

    if (!loadResult.ok) {
      throw new Error('TTS 未能完成加载，请确认 TTS 窗口正在运行')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换失败'
    await refreshState()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void refreshState()
  window.electronAPI?.onVoiceSamplesChanged?.(() => {
    void refreshState()
  })
})
</script>

<template>
  <section class="touch-playback">
    <p class="section-label">触摸反馈（官方默认）</p>
    <div class="setting-card">
      <div class="setting-row">
        <span class="label">{{ OFFICIAL_CURATED_CLIPS_LABEL }}</span>
        <button
          type="button"
          class="ios-switch"
          :class="{ 'ios-switch--on': useCuratedClips }"
          role="switch"
          :aria-checked="useCuratedClips"
          :disabled="saving || loading || !canUse"
          @click="handleToggle"
        >
          <span class="ios-switch__track">
            <span class="ios-switch__knob" />
          </span>
        </button>
      </div>
      <p v-if="loading" class="hint">加载中…</p>
      <p v-else-if="!canUse" class="hint warn">{{ OFFICIAL_CURATED_CLIPS_NEED_OFFICIAL_HINT }}</p>
      <p v-else class="hint">{{ OFFICIAL_CURATED_CLIPS_HINT }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.touch-playback {
  margin: 0 0 12px;
}

.section-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
}

.setting-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.hint.warn {
  color: #b45309;
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;
}

.ios-switch {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ios-switch:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ios-switch__track {
  display: block;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: #d1d5db;
  position: relative;
  transition: background 0.2s ease;
}

.ios-switch--on .ios-switch__track {
  background: #ec4899;
}

.ios-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s ease;
}

.ios-switch--on .ios-switch__knob {
  transform: translateX(18px);
}
</style>
