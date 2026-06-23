import { runLipSyncWhilePlaying, stopLipSync } from './live2dLipSync'
import { getTtsVolume } from './ttsVolume'

const MANIFEST_URL = '/touch_clips/manifest.json'

interface TouchClipManifest {
  groups?: string[][] | string[]
}

let manifestPromise: Promise<TouchClipManifest | null> | null = null

/** manifest.groups 应为 string[][]；兼容误写成 string[] 的旧格式 */
function normalizeGroups(raw: TouchClipManifest['groups']): string[][] {
  if (!raw || raw.length === 0) return []

  if (typeof raw[0] === 'string') {
    console.warn(
      '[TouchClips] manifest.json 格式有误：groups 应为 [[\"a.wav\"], [\"b.wav\"]]，已按单文件分组兼容处理'
    )
    return (raw as string[])
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
      .map((name) => [name.trim()])
  }

  return (raw as string[][])
    .filter((group) => Array.isArray(group) && group.length > 0)
    .map((group) => group.map((name) => String(name).trim()).filter(Boolean))
    .filter((group) => group.length > 0)
}
let currentAudio: HTMLAudioElement | null = null

function cleanupAudio(): void {
  stopLipSync()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

async function loadManifest(): Promise<TouchClipManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
        if (!response.ok) {
          console.warn('[TouchClips] 未找到 manifest.json')
          return null
        }
        return (await response.json()) as TouchClipManifest
      } catch (error) {
        console.warn('[TouchClips] 加载 manifest 失败', error)
        return null
      }
    })()
  }
  return manifestPromise
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

export async function playRandomTouchClip(): Promise<boolean> {
  cleanupAudio()

  const manifest = await loadManifest()
  const groups = normalizeGroups(manifest?.groups)
  if (groups.length === 0) {
    console.warn('[TouchClips] manifest 中没有可用音频组，请编辑 public/touch_clips/')
    return false
  }

  const group = pickRandom(groups)
  if (!group) return false

  const fileName = pickRandom(group)
  if (!fileName) return false

  const url = `/touch_clips/${fileName.replace(/^\/+/, '')}`
  currentAudio = new Audio(url)
  currentAudio.volume = getTtsVolume()

  currentAudio.addEventListener(
    'ended',
    () => {
      cleanupAudio()
    },
    { once: true }
  )

  try {
    const lipSyncDone = runLipSyncWhilePlaying(currentAudio)
    await currentAudio.play()
    console.info('[TouchClips] 播放', url)
    await lipSyncDone
    return true
  } catch (error) {
    console.error('[TouchClips] 播放失败', url, error)
    cleanupAudio()
    return false
  }
}

export function stopTouchClip(): void {
  cleanupAudio()
}
