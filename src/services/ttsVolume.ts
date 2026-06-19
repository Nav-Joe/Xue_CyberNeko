const STORAGE_KEY = 'xue-neko-tts-volume'
const DEFAULT_VOLUME = 0.75

export function getTtsVolume(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    return DEFAULT_VOLUME
  }

  const value = Number(raw)
  if (Number.isNaN(value)) {
    return DEFAULT_VOLUME
  }

  return Math.min(1, Math.max(0, value))
}

export function setTtsVolume(volume: number): void {
  const clamped = Math.min(1, Math.max(0, volume))
  localStorage.setItem(STORAGE_KEY, String(clamped))
  window.dispatchEvent(new CustomEvent('tts-volume-changed', { detail: clamped }))
}
