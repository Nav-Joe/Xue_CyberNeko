export type HomeAppearance = 'light' | 'dark'

export const HOME_APPEARANCE_KEY = 'xue-neko-home-appearance'

/** 家窗口与聊天窗是两个渲染进程；localStorage 同源可共享，BroadcastChannel 负责已打开窗口即时同步。 */
let appearanceChannel: BroadcastChannel | null = null

export function parseHomeAppearance(raw: unknown): HomeAppearance {
  return raw === 'dark' ? 'dark' : 'light'
}

export function readHomeAppearance(): HomeAppearance {
  return parseHomeAppearance(localStorage.getItem(HOME_APPEARANCE_KEY))
}

function getAppearanceChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (appearanceChannel) return appearanceChannel
  try {
    appearanceChannel = new BroadcastChannel(HOME_APPEARANCE_KEY)
    return appearanceChannel
  } catch {
    return null
  }
}

export function writeHomeAppearance(appearance: HomeAppearance): void {
  localStorage.setItem(HOME_APPEARANCE_KEY, appearance)
  getAppearanceChannel()?.postMessage(appearance)
}

export function toggleHomeAppearance(current: HomeAppearance): HomeAppearance {
  return current === 'dark' ? 'light' : 'dark'
}

export function subscribeHomeAppearance(onChange: (appearance: HomeAppearance) => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== HOME_APPEARANCE_KEY) return
    onChange(readHomeAppearance())
  }
  window.addEventListener('storage', onStorage)

  const channel = getAppearanceChannel()
  const onMessage = (event: MessageEvent): void => {
    onChange(parseHomeAppearance(event.data))
  }
  channel?.addEventListener('message', onMessage)

  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
  }
}
