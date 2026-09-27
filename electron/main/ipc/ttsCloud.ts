import { basename } from 'path'
import { BrowserWindow, dialog, ipcMain, app } from 'electron'

import { logWarn } from '../logging/logger'
import {
  designCloudVoice,
  enrollCustomSampleCloud,
  enrollOfficialSampleCloud
} from '../ttsCloud/cloudVoiceOps'
import {
  approveCloudPendingCreate,
  getCloudPendingPreviewAudio,
  getCloudPendingReviewStatus,
  rejectCloudPendingCreate
} from '../ttsCloud/cloudCreateReview'
import { isSafeCloudLocalVoiceId } from '../ttsCloud/cloudCachePaths'
import { readCloudVoiceCorpus, resolveCloudCacheWav } from '../ttsCloud/cloudCorpusCache'
import { prewarmCloudCorpus } from '../ttsCloud/cloudCorpusPrewarm'
import { getTtsCloudConfigStore } from '../ttsCloud/configStore'
import { previewCloudTts } from '../ttsCloud/preview'
import { removeCloudVoice } from '../ttsCloud/removeCloudVoice'
import { speakCloudTts } from '../ttsCloud/speak'
import type { TtsCloudConfigPatch } from '../ttsCloud/types'

export function registerTtsCloudIpc(): void {
  ipcMain.handle('tts-cloud-get-config', () => {
    try {
      return { ok: true as const, config: getTtsCloudConfigStore().getView() }
    } catch (error) {
      logWarn('ttsCloud', 'tts-cloud-get-config failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'get_config_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-set-config', (_event, patch: TtsCloudConfigPatch) => {
    try {
      getTtsCloudConfigStore().writePatch(patch ?? {})
      return { ok: true as const, config: getTtsCloudConfigStore().getView() }
    } catch (error) {
      logWarn('ttsCloud', 'tts-cloud-set-config failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'set_config_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-enroll-official', async () => {
    try {
      return await enrollOfficialSampleCloud()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false as const, detail: '云克隆已取消' }
      }
      logWarn('ttsCloud', 'tts-cloud-enroll-official failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'enroll_failed'
      }
    }
  })

  ipcMain.handle(
    'tts-cloud-enroll-custom',
    async (event, payload?: { displayName?: string; referenceText?: string }) => {
      try {
        const parent = BrowserWindow.fromWebContents(event.sender)
        const picked = await dialog.showOpenDialog(parent ?? undefined, {
          title: '选择云克隆参考音 WAV',
          properties: ['openFile'],
          filters: [{ name: 'WAV 音频', extensions: ['wav'] }]
        })
        if (picked.canceled || picked.filePaths.length === 0) {
          return { ok: false as const, detail: '已取消选择文件' }
        }
        const filePath = picked.filePaths[0]!
        const displayName =
          (typeof payload?.displayName === 'string' && payload.displayName.trim()) ||
          basename(filePath, '.wav') ||
          '自定义云克隆'
        const referenceText =
          typeof payload?.referenceText === 'string' ? payload.referenceText : ''
        return await enrollCustomSampleCloud({
          filePath,
          displayName,
          referenceText
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { ok: false as const, detail: '云克隆已取消' }
        }
        logWarn('ttsCloud', 'tts-cloud-enroll-custom failed', error)
        return {
          ok: false as const,
          detail: error instanceof Error ? error.message : 'enroll_custom_failed'
        }
      }
    }
  )

  ipcMain.handle(
    'tts-cloud-design-voice',
    async (
      _event,
      payload?: {
        displayName?: string
        voicePrompt?: string
        previewText?: string
        stageOnly?: boolean
        corpus?: unknown
      }
    ) => {
      try {
        return await designCloudVoice({
          displayName: typeof payload?.displayName === 'string' ? payload.displayName : '',
          voicePrompt: typeof payload?.voicePrompt === 'string' ? payload.voicePrompt : '',
          previewText: typeof payload?.previewText === 'string' ? payload.previewText : undefined,
          stageOnly: payload?.stageOnly === true,
          corpus: payload?.corpus as import('../../../src/types/corpus').CorpusData | undefined,
          userDataPath: app.getPath('userData')
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { ok: false as const, detail: '声音设计已取消' }
        }
        logWarn('ttsCloud', 'tts-cloud-design-voice failed', error)
        return {
          ok: false as const,
          detail: error instanceof Error ? error.message : 'design_failed'
        }
      }
    }
  )

  ipcMain.handle(
    'tts-cloud-remove-voice',
    async (_event, payload?: { localId?: string; deleteRemote?: boolean }) => {
      try {
        const localId = typeof payload?.localId === 'string' ? payload.localId.trim() : ''
        if (!isSafeCloudLocalVoiceId(localId)) {
          return { ok: false as const, detail: '非法音色 id' }
        }
        return await removeCloudVoice({
          localId,
          deleteRemote: payload?.deleteRemote !== false
        })
      } catch (error) {
        logWarn('ttsCloud', 'tts-cloud-remove-voice failed', error)
        return {
          ok: false as const,
          detail: error instanceof Error ? error.message : 'remove_failed'
        }
      }
    }
  )

  ipcMain.handle('tts-cloud-preview', async (_event, payload?: { text?: string }) => {
    try {
      const text = typeof payload?.text === 'string' ? payload.text : ''
      const result = await previewCloudTts({ text })
      if (!result.ok) {
        return result
      }
      return { ok: true as const, audio: result.audio, mime: result.mime }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false as const, detail: '合成已取消' }
      }
      logWarn('ttsCloud', 'tts-cloud-preview failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'preview_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-synthesize', async (_event, payload?: { text?: string }) => {
    try {
      const text = typeof payload?.text === 'string' ? payload.text : ''
      const result = await speakCloudTts({ text })
      if (!result.ok) {
        return result
      }
      return { ok: true as const, audio: result.audio, mime: result.mime }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false as const, detail: '合成已取消' }
      }
      logWarn('ttsCloud', 'tts-cloud-synthesize failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'synthesize_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-get-corpus', (_event, payload?: { localId?: string }) => {
    try {
      const view = getTtsCloudConfigStore().getView()
      const localId =
        (typeof payload?.localId === 'string' && payload.localId.trim()) ||
        view.qwen.activeVoiceLocalId
      if (!localId) {
        return { ok: false as const, detail: '尚未选择云端音色' }
      }
      if (!isSafeCloudLocalVoiceId(localId)) {
        return { ok: false as const, detail: '非法音色 id' }
      }
      const known =
        view.qwen.voices.some((v) => v.id === localId) ||
        view.qwen.activeVoiceLocalId === localId
      if (!known) {
        return { ok: false as const, detail: '音色不存在' }
      }
      const corpus = readCloudVoiceCorpus(app.getPath('userData'), localId)
      return { ok: true as const, localId, corpus }
    } catch (error) {
      logWarn('ttsCloud', 'tts-cloud-get-corpus failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'get_corpus_failed'
      }
    }
  })

  ipcMain.handle(
    'tts-cloud-prewarm-corpus',
    async (_event, payload?: { corpus?: unknown; localId?: string }) => {
      try {
        const localId =
          typeof payload?.localId === 'string' && payload.localId.trim()
            ? payload.localId.trim()
            : undefined
        if (localId !== undefined && !isSafeCloudLocalVoiceId(localId)) {
          return { ok: false as const, detail: '非法音色 id' }
        }
        return await prewarmCloudCorpus({
          corpus: payload?.corpus,
          localId,
          userDataPath: app.getPath('userData')
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { ok: false as const, detail: '云端语料预热已取消' }
        }
        logWarn('ttsCloud', 'tts-cloud-prewarm-corpus failed', error)
        return {
          ok: false as const,
          detail: error instanceof Error ? error.message : 'prewarm_failed'
        }
      }
    }
  )

  ipcMain.handle('tts-cloud-get-cache-audio', (_event, payload?: { text?: string }) => {
    try {
      const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
      if (!text) {
        return { ok: false as const, detail: '文本为空' }
      }
      const view = getTtsCloudConfigStore().getView()
      const localId = view.qwen.activeVoiceLocalId
      if (!localId) {
        return { ok: false as const, detail: '尚未选择云端音色' }
      }
      const hit = resolveCloudCacheWav(app.getPath('userData'), localId, text)
      if (!hit.ok) {
        return { ok: false as const, detail: '云端触摸缓存未命中' }
      }
      return {
        ok: true as const,
        audio: hit.bytes.buffer.slice(
          hit.bytes.byteOffset,
          hit.bytes.byteOffset + hit.bytes.byteLength
        ),
        mime: hit.mime
      }
    } catch (error) {
      logWarn('ttsCloud', 'tts-cloud-get-cache-audio failed', error)
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'cache_audio_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-get-pending-preview', () => {
    try {
      const hit = getCloudPendingPreviewAudio(app.getPath('userData'))
      if (!hit.ok) {
        return { ok: false as const, detail: '暂无预览音频' }
      }
      return { ok: true as const, audio: hit.audio, mime: hit.mime }
    } catch (error) {
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'pending_preview_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-get-pending-status', () => {
    try {
      return {
        ok: true as const,
        status: getCloudPendingReviewStatus(app.getPath('userData'))
      }
    } catch (error) {
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'pending_status_failed'
      }
    }
  })

  ipcMain.handle('tts-cloud-approve-pending', () => {
    try {
      return approveCloudPendingCreate({ userDataPath: app.getPath('userData') })
    } catch (error) {
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : 'approve_pending_failed'
      }
    }
  })

  ipcMain.handle(
    'tts-cloud-reject-pending',
    async (_event, payload?: { action?: 'regenerate' | 'skip' }) => {
      try {
        const action = payload?.action === 'regenerate' ? 'regenerate' : 'skip'
        return await rejectCloudPendingCreate({
          userDataPath: app.getPath('userData'),
          action
        })
      } catch (error) {
        return {
          ok: false as const,
          detail: error instanceof Error ? error.message : 'reject_pending_failed'
        }
      }
    }
  )
}
