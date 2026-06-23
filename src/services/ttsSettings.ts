const REALTIME_KEY = 'xue-neko-tts-realtime'

/** 默认关闭：使用预生成缓存，点击即播 */
export function isRealtimeInferenceEnabled(): boolean {
  return localStorage.getItem(REALTIME_KEY) === '1'
}

export function setRealtimeInferenceEnabled(enabled: boolean): void {
  localStorage.setItem(REALTIME_KEY, enabled ? '1' : '0')
  window.dispatchEvent(new CustomEvent('tts-realtime-changed', { detail: enabled }))
}

export const REALTIME_INFERENCE_HINT =
  '开启后每次点击走实时推理。需先在高级设置中启用，并确保回家窗口已选择有效声线。'
