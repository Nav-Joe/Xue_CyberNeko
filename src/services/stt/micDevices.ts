export type MicDeviceInfo = {
  deviceId: string
  label: string
}

let cachedDevices: MicDeviceInfo[] = []
let deviceChangeBound = false
let warmPromise: Promise<MicDeviceInfo[]> | null = null

export function getCachedMicDevices(): MicDeviceInfo[] {
  return cachedDevices.slice()
}

/**
 * 解析用户配置的麦：空 = 系统默认；有 id 则尽量精确匹配。
 */
export function resolveMicChoice(
  configuredDeviceId: string,
  devices: MicDeviceInfo[]
): { deviceId?: string; label: string; missing: boolean } {
  const id = configuredDeviceId.trim()
  if (!id) {
    return { label: '系统默认', missing: false }
  }
  const hit = devices.find((d) => d.deviceId === id)
  if (hit) {
    return { deviceId: hit.deviceId, label: hit.label, missing: false }
  }
  return {
    deviceId: id,
    label: '已保存的麦克风（当前列表中未找到）',
    missing: true
  }
}

async function ensureMicPermissionQuiet(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    return true
  } catch {
    return false
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
  }
}

/**
 * 枚举本机 audioinput；可选择先要权限以拿到可读 label。
 * 结果写入模块缓存，供设置页与录音共用。
 */
export async function listMicDevices(options?: {
  requestPermission?: boolean
}): Promise<MicDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    cachedDevices = []
    return []
  }

  if (options?.requestPermission) {
    await ensureMicPermissionQuiet()
  }

  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'audioinput' && Boolean(d.deviceId)
  )

  cachedDevices = inputs.map((d, index) => ({
    deviceId: d.deviceId,
    label: d.label?.trim() || `麦克风 ${index + 1}`
  }))
  return getCachedMicDevices()
}

function bindDeviceChangeListener(): void {
  if (deviceChangeBound || !navigator.mediaDevices?.addEventListener) return
  deviceChangeBound = true
  navigator.mediaDevices.addEventListener('devicechange', () => {
    // 热插拔后静默刷新，不主动弹权限窗
    void listMicDevices({ requestPermission: false }).catch(() => undefined)
  })
}

/**
 * 启动时后台枚举麦克风：不主动弹权限窗（系统已授权时才能拿到真实设备名）。
 * 并发调用共用同一次 Promise，避免重复 enumerate。
 */
export function warmMicDevicesInBackground(): Promise<MicDeviceInfo[]> {
  bindDeviceChangeListener()
  if (!warmPromise) {
    warmPromise = listMicDevices({ requestPermission: false })
      .catch(() => [] as MicDeviceInfo[])
      .finally(() => {
        warmPromise = null
      })
  }
  return warmPromise
}

/** @internal 测试用 */
export function __resetMicDeviceCacheForTests(): void {
  cachedDevices = []
  warmPromise = null
}
