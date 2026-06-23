const TOUCH_MODE_KEY = 'xue-neko-touch-mode'

export type TouchFeedbackMode = 'curated' | 'custom_corpus' | 'alt_engine_corpus'

/** 默认：精选预录 wav，稳定音色 */
export function getTouchFeedbackMode(): TouchFeedbackMode {
  const raw = localStorage.getItem(TOUCH_MODE_KEY)
  if (raw === 'custom_corpus') {
    return 'custom_corpus'
  }
  if (raw === 'alt_engine_corpus') {
    return 'alt_engine_corpus'
  }
  return 'curated'
}

/** 语料库 TTS 触摸（含 Qwen 克隆与第三方引擎语料） */
export function isCustomCorpusTouchEnabled(): boolean {
  const mode = getTouchFeedbackMode()
  return mode === 'custom_corpus' || mode === 'alt_engine_corpus'
}

export function isAltEngineCorpusTouchEnabled(): boolean {
  return getTouchFeedbackMode() === 'alt_engine_corpus'
}

export function setTouchFeedbackMode(mode: TouchFeedbackMode): void {
  localStorage.setItem(TOUCH_MODE_KEY, mode)
  window.dispatchEvent(new CustomEvent('touch-mode-changed', { detail: mode }))
}
