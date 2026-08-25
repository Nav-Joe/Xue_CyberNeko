/**
 * 主进程缩略图截屏，只留在内存，不写磁盘；本模块不做识图。
 */
import { desktopCapturer, screen, type NativeImage, type Size } from 'electron'

export type CaptureImageFormat = 'jpeg' | 'png'

export type CaptureScreenResult = {
  /** 编码后的像素（仅内存；调用方禁止持久化） */
  bytes: Buffer
  format: CaptureImageFormat
  /** 请求的缩略图尺寸 */
  thumbnailSize: Size
  /** 主屏 workArea */
  workArea: Size
  /** getSources 墙钟 ms */
  captureMs: number
  /** toJPEG/toPNG 墙钟 ms */
  encodeMs: number
}

export type CaptureScreenDeps = {
  getPrimaryWorkArea: () => Size
  getSources: (opts: {
    types: Array<'screen' | 'window'>
    thumbnailSize: Size
  }) => Promise<Array<{ id: string; name: string; thumbnail: NativeImage }>>
}

const defaultDeps: CaptureScreenDeps = {
  getPrimaryWorkArea: () => screen.getPrimaryDisplay().workAreaSize,
  getSources: (opts) => desktopCapturer.getSources(opts)
}

/**
 * 缩略图边长：workArea 约 1/2，且长边 ≤ maxLongEdge（默认 1280）。
 */
export function resolveThumbnailSize(
  workArea: Size,
  maxLongEdge = 1280
): Size {
  const halfW = Math.max(1, Math.floor(workArea.width / 2))
  const halfH = Math.max(1, Math.floor(workArea.height / 2))
  const long = Math.max(halfW, halfH)
  if (long <= maxLongEdge) {
    return { width: halfW, height: halfH }
  }
  const scale = maxLongEdge / long
  return {
    width: Math.max(1, Math.floor(halfW * scale)),
    height: Math.max(1, Math.floor(halfH * scale))
  }
}

export type CaptureScreenOptions = {
  /** 总开关：false 时不调用截屏；调用方应事先判断，不要硬撞这个错误 */
  enabled: boolean
  format?: CaptureImageFormat
  /** JPEG 质量 1–100；仅 format=jpeg */
  jpegQuality?: number
  maxLongEdge?: number
  deps?: Partial<CaptureScreenDeps>
}

/**
 * 截主屏缩略图到内存 Buffer。总开关为 false 时抛错（调用方应先判断）。
 */
export async function capturePrimaryScreen(
  options: CaptureScreenOptions
): Promise<CaptureScreenResult> {
  if (!options.enabled) {
    throw new Error('capturePrimaryScreen: enabled=false (caller must gate)')
  }

  const deps: CaptureScreenDeps = { ...defaultDeps, ...options.deps }
  const format = options.format ?? 'jpeg'
  const jpegQuality = options.jpegQuality ?? 70
  const workArea = deps.getPrimaryWorkArea()
  const thumbnailSize = resolveThumbnailSize(workArea, options.maxLongEdge ?? 1280)

  const t0 = Date.now()
  const sources = await deps.getSources({
    types: ['screen'],
    thumbnailSize
  })
  const captureMs = Date.now() - t0

  const primary = sources[0]
  if (!primary || primary.thumbnail.isEmpty()) {
    throw new Error('capturePrimaryScreen: no screen source or empty thumbnail')
  }

  const t1 = Date.now()
  const bytes =
    format === 'png'
      ? primary.thumbnail.toPNG()
      : primary.thumbnail.toJPEG(Math.min(100, Math.max(1, jpegQuality)))
  const encodeMs = Date.now() - t1

  return {
    bytes: Buffer.from(bytes),
    format,
    thumbnailSize,
    workArea,
    captureMs,
    encodeMs
  }
}
