<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { setTouchFeedbackMode } from '../services/touchModeSettings'
import { loadTtsCapabilities } from '../services/ttsCapabilities'

export interface VoiceSampleItem {
  folderId: string
  displayName: string
  kind: 'official' | 'custom'
  hasReference: boolean
}

const OFFICIAL_SAMPLE_ID = 'default_sample'

const samples = ref<VoiceSampleItem[]>([])
const activeFolderId = ref<string | null>(null)
const loading = ref(true)
const switching = ref(false)
const deletingId = ref<string | null>(null)
const error = ref('')
const voiceForgeSupported = ref(true)
const disabledHint = ref('')

let unbindVoiceSamplesChanged: (() => void) | null = null
let unbindHomeVisibility: (() => void) | null = null

function isOfficialSample(item: VoiceSampleItem): boolean {
  return item.folderId === OFFICIAL_SAMPLE_ID || item.kind === 'official'
}

function switchConfirmMessage(target: VoiceSampleItem): { title: string; message: string; confirmLabel: string } {
  if (isOfficialSample(target)) {
    return {
      title: '切换为官方默认',
      message:
        '将切换为「默认配置」。若设置中开启「非语料库音频」则使用精选触摸音频；关闭则使用语料库 TTS。桌宠将暂时隐藏并在切换完成后重新出现。确定吗？',
      confirmLabel: '确定切换'
    }
  }
  return {
    title: '切换音色',
    message: `将切换到「${target.displayName}」。桌宠会暂时隐藏并显示加载进度；开启实时推理时仅加载引擎，否则还会预热语料缓存。确定吗？`,
    confirmLabel: '确定切换'
  }
}

async function refreshList(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (window.electronAPI?.listVoiceSamples) {
      samples.value = await window.electronAPI.listVoiceSamples()
    }
    if (window.electronAPI?.readVoiceForgeConfig) {
      const config = await window.electronAPI.readVoiceForgeConfig()
      activeFolderId.value = config.activeSample?.folderId ?? null
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载音色列表失败'
  } finally {
    loading.value = false
  }
}

function isActive(folderId: string): boolean {
  return activeFolderId.value === folderId
}

async function handleSwitch(folderId: string): Promise<void> {
  if (!voiceForgeSupported.value) {
    return
  }
  if (isActive(folderId) || switching.value) {
    return
  }

  const target = samples.value.find((item) => item.folderId === folderId)
  if (!target?.hasReference) {
    error.value = '该音色尚未就绪，无法切换'
    return
  }

  const confirmCopy = switchConfirmMessage(target)
  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog(confirmCopy)
    : window.confirm(confirmCopy.message)
  if (!confirmed) {
    return
  }

  switching.value = true
  error.value = ''
  try {
    if (!window.electronAPI?.switchVoiceSample) {
      throw new Error('当前环境不支持切换音色')
    }
    const profile = await window.electronAPI.switchVoiceSample(folderId)
    setTouchFeedbackMode(profile.touchMode)

    if (!window.electronAPI?.completeVoiceSwitch) {
      throw new Error('当前环境不支持完成切换')
    }

    let loadMode: 'curated' | 'engine' | 'prewarm' = 'curated'
    if (profile.touchMode !== 'curated') {
      loadMode = 'engine'
    }

    await window.electronAPI.completeVoiceSwitch({
      touchMode: profile.touchMode,
      loadMode
    })

    activeFolderId.value = folderId
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换失败'
  } finally {
    switching.value = false
  }
}

async function handleDelete(folderId: string): Promise<void> {
  const target = samples.value.find((item) => item.folderId === folderId)
  if (!target || isOfficialSample(target) || switching.value || deletingId.value) {
    return
  }

  const activeHint = isActive(folderId)
    ? '这是当前使用的声线，删除后将自动切回官方默认配置。'
    : ''
  const confirmed = window.electronAPI?.showConfirmDialog
    ? await window.electronAPI.showConfirmDialog({
        title: '删除自定义声线',
        message: `确定删除「${target.displayName}」吗？样本文件夹将被永久移除。${activeHint}`,
        confirmLabel: '确定删除'
      })
    : window.confirm(`确定删除「${target.displayName}」吗？${activeHint}`)
  if (!confirmed) {
    return
  }

  deletingId.value = folderId
  error.value = ''
  try {
    if (!window.electronAPI?.deleteVoiceSample) {
      throw new Error('当前环境不支持删除声线')
    }
    const result = await window.electronAPI.deleteVoiceSample(folderId)

    if (result.wasActive) {
      setTouchFeedbackMode('curated')
      if (window.electronAPI?.completeVoiceSwitch) {
        await window.electronAPI.completeVoiceSwitch({
          touchMode: 'curated',
          loadMode: 'curated'
        })
      }
      activeFolderId.value = OFFICIAL_SAMPLE_ID
    } else if (activeFolderId.value === folderId) {
      activeFolderId.value = null
    }

    await refreshList()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  void loadTtsCapabilities().then((caps) => {
    voiceForgeSupported.value = caps.voiceForgeSupported
    disabledHint.value = caps.hint ?? ''
  })
  void refreshList()
  unbindVoiceSamplesChanged =
    window.electronAPI?.onVoiceSamplesChanged?.(() => {
      void refreshList()
    }) ?? null
  unbindHomeVisibility =
    window.electronAPI?.onHomeVisibilityChanged?.((visible) => {
      if (visible) {
        void refreshList()
      }
    }) ?? null
})

onUnmounted(() => {
  unbindVoiceSamplesChanged?.()
  unbindHomeVisibility?.()
})
</script>

<template>
  <section class="voice-switcher" :class="{ 'voice-switcher--disabled': !voiceForgeSupported }">
    <h2 class="title">音色切换</h2>
    <p v-if="!voiceForgeSupported && disabledHint" class="disabled-banner">{{ disabledHint }}</p>
    <p v-else class="hint">
      官方默认可选精选音频或语料 TTS（见设置开关）；自定义声线可切换或删除。切换时桌宠会暂时隐藏。
    </p>

    <p v-if="loading" class="status">加载中…</p>
    <p v-else-if="error" class="status error">{{ error }}</p>

    <ul v-else class="sample-list">
      <li v-for="item in samples" :key="item.folderId" class="sample-item">
        <div class="sample-body">
          <span class="sample-name">{{ item.displayName }}</span>
          <span class="sample-meta">
            {{ item.kind === 'official' ? '官方 · 精选音频' : '自定义 · 克隆语料' }} · {{ item.folderId }}
          </span>
          <span v-if="!item.hasReference" class="sample-warn">参考音未就绪</span>
          <span v-else-if="isActive(item.folderId)" class="sample-active">当前使用</span>
        </div>
        <div class="sample-actions">
          <button
            type="button"
            class="switch-btn"
            :disabled="
              !voiceForgeSupported ||
              switching ||
              deletingId !== null ||
              isActive(item.folderId) ||
              !item.hasReference
            "
            @click="handleSwitch(item.folderId)"
          >
            {{ isActive(item.folderId) ? '使用中' : '切换' }}
          </button>
          <button
            v-if="!isOfficialSample(item)"
            type="button"
            class="delete-btn"
            :disabled="!voiceForgeSupported || switching || deletingId !== null"
            :aria-busy="deletingId === item.folderId"
            @click="handleDelete(item.folderId)"
          >
            {{ deletingId === item.folderId ? '删除中…' : '删除' }}
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!loading && samples.length === 0" class="status">暂无可切换音色，请先在音色工坊创建。</p>
  </section>
</template>

<style scoped>
.voice-switcher {
  margin: 0 0 16px;
  padding: 14px 12px;
  border-radius: 14px;
  background: #f9fafb;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.voice-switcher--disabled {
  opacity: 0.92;
}

.disabled-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid rgba(251, 146, 60, 0.35);
  color: #9a3412;
  font-size: 12px;
  line-height: 1.55;
}

.title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7280;
}

.sample-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sample-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.sample-body {
  flex: 1;
  min-width: 0;
}

.sample-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.sample-meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}

.sample-active {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: #059669;
  font-weight: 600;
}

.sample-warn {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: #d97706;
}

.switch-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: #ec4899;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sample-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.delete-btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  background: #fff;
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.delete-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  color: #9ca3af;
  border-color: rgba(0, 0, 0, 0.08);
}

.switch-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #d1d5db;
  color: #6b7280;
}

.status {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.status.error {
  color: #dc2626;
}
</style>
