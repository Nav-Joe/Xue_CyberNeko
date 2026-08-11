/**
 * 宠物窗语音引擎加载编排（遮罩尺寸、begin/finished Promise）。
 * 从 main/index 抽出，行为不变；IPC 通道名与时序勿在此改。
 */
import { getHomeWindow, notifyHomeVisibility } from '../windows/homeWindow'
import {
  getPetWindow,
  setPetWindowOverlay,
  showPetWindowIfNeeded
} from '../windows/petWindow'

const ENGINE_LOAD_OVERLAY_WIDTH = 360
const ENGINE_LOAD_OVERLAY_HEIGHT = 260

export type VoiceEngineLoadMode = 'curated' | 'engine' | 'prewarm' | 'realtime'

export type CompleteVoiceSwitchPayload = {
  touchMode: 'curated' | 'custom_corpus'
  loadMode?: VoiceEngineLoadMode
  prewarm?: boolean
}

export type BeginVoiceEngineLoadPayload = {
  title: string
  message: string
  mode: VoiceEngineLoadMode
  sync?: boolean
  expectedTouchMode?: 'curated' | 'custom_corpus'
  syncMessage?: string
}

export type VoiceEngineLoadCoordinator = {
  completeVoiceSwitchOnPet: (payload: CompleteVoiceSwitchPayload) => Promise<void>
  beginVoiceEngineLoadOnPet: (payload: BeginVoiceEngineLoadPayload) => Promise<{ ok: boolean }>
  onVoiceEngineLoadFinished: (result: { ok: boolean }) => void
}

export function createVoiceEngineLoadCoordinator(): VoiceEngineLoadCoordinator {
  let pendingResolve: ((result: { ok: boolean }) => void) | null = null

  function showPetForEngineLoad(): void {
    const homeWindow = getHomeWindow()
    if (homeWindow?.isVisible()) {
      homeWindow.hide()
    }
    notifyHomeVisibility(false)

    if (!getPetWindow()) {
      return
    }

    setPetWindowOverlay(ENGINE_LOAD_OVERLAY_WIDTH, ENGINE_LOAD_OVERLAY_HEIGHT, true)
    showPetWindowIfNeeded()
  }

  async function completeVoiceSwitchOnPet(payload: CompleteVoiceSwitchPayload): Promise<void> {
    showPetForEngineLoad()
    const petWindow = getPetWindow()
    if (!petWindow) {
      return
    }
    petWindow.webContents.send('voice-config-changed', payload)
  }

  async function beginVoiceEngineLoadOnPet(
    payload: BeginVoiceEngineLoadPayload
  ): Promise<{ ok: boolean }> {
    showPetForEngineLoad()
    const petWindow = getPetWindow()
    if (!petWindow) {
      return { ok: false }
    }

    // 新一轮 begin 会作废上一轮未完成的 Promise，避免叠加载把旧调用方挂死
    pendingResolve?.({ ok: false })
    pendingResolve = null

    return new Promise((resolve) => {
      pendingResolve = resolve
      petWindow.webContents.send('voice-engine-load-begin', payload)
    })
  }

  function onVoiceEngineLoadFinished(result: { ok: boolean }): void {
    pendingResolve?.(result)
    pendingResolve = null
  }

  return {
    completeVoiceSwitchOnPet,
    beginVoiceEngineLoadOnPet,
    onVoiceEngineLoadFinished
  }
}
