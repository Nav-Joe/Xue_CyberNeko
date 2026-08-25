/**
 * 一次观察：先过隐私判断，再截屏、识图，最后只留下文字摘要。
 */
import { capturePrimaryScreen, type CaptureScreenOptions } from './capture'
import { isVisionConfigured } from './configStore'
import { evaluatePrivacyGate } from './privacy'
import { listProcessExecutablePaths } from './processExecutables'
import type { VisionLlmConfig } from './types'
import { summarizeScreenImage, type VisionSummaryDeps } from './visionSummary'

export type ObserveResult = {
  observation: import('./types').ScreenObservation
  captureMs?: number
  encodeMs?: number
  visionMs?: number
  totalObserveMs: number
  imageBytes?: number
}

export type ObserveScreenDeps = {
  listProcessExecutablePaths: () => Promise<string[]>
}

export type ObserveScreenOptions = {
  enabled: boolean
  pausedUntilMs?: number | null
  processBlacklist?: string[]
  nowMs?: number
  vision: VisionLlmConfig
  capture?: Omit<CaptureScreenOptions, 'enabled'>
  visionDeps?: Partial<VisionSummaryDeps>
  deps?: Partial<ObserveScreenDeps>
}

const defaultObserveDeps: ObserveScreenDeps = {
  listProcessExecutablePaths
}

export async function observePrimaryScreen(options: ObserveScreenOptions): Promise<ObserveResult> {
  const wall0 = Date.now()
  const observeDeps: ObserveScreenDeps = { ...defaultObserveDeps, ...options.deps }
  const blacklist = options.processBlacklist ?? []

  let processExePaths: string[] = []
  if (options.enabled && blacklist.length > 0) {
    try {
      processExePaths = await observeDeps.listProcessExecutablePaths()
    } catch {
      processExePaths = []
    }
  }

  const gate = evaluatePrivacyGate({
    enabled: options.enabled,
    pausedUntilMs: options.pausedUntilMs,
    nowMs: options.nowMs,
    processBlacklist: blacklist,
    processExePaths
  })

  if (!gate.allow) {
    const summary =
      gate.reason === 'disabled'
        ? '已跳过：总开关关闭'
        : gate.reason === 'paused'
          ? '已跳过：看屏暂停中'
          : `已跳过：进程黑名单命中（${gate.matched ?? 'matched'}）`
    return {
      observation: {
        ts: new Date().toISOString(),
        summary,
        skipped: gate.reason,
        usableForPrompt: false
      },
      totalObserveMs: Date.now() - wall0
    }
  }

  if (!isVisionConfigured(options.vision)) {
    return {
      observation: {
        ts: new Date().toISOString(),
        summary: '已跳过：视觉 baseUrl/model/apiKey 未配置完整',
        skipped: 'vision_unconfigured',
        usableForPrompt: false
      },
      totalObserveMs: Date.now() - wall0
    }
  }

  let capture
  try {
    capture = await capturePrimaryScreen({
      enabled: true,
      format: options.capture?.format ?? 'jpeg',
      jpegQuality: options.capture?.jpegQuality,
      maxLongEdge: options.capture?.maxLongEdge,
      deps: options.capture?.deps
    })
  } catch (err) {
    return {
      observation: {
        ts: new Date().toISOString(),
        summary: err instanceof Error ? err.message : '截屏失败',
        skipped: 'capture_failed',
        usableForPrompt: false
      },
      totalObserveMs: Date.now() - wall0
    }
  }

  const mimeType = capture.format === 'png' ? 'image/png' : 'image/jpeg'
  const vision = await summarizeScreenImage({
    imageBytes: capture.bytes,
    mimeType,
    config: options.vision,
    deps: options.visionDeps
  })
  const imageBytes = capture.bytes.length

  if (!vision.ok) {
    return {
      observation: {
        ts: new Date().toISOString(),
        summary: `识图失败：${vision.detail}`,
        skipped: 'vision_failed',
        usableForPrompt: false
      },
      captureMs: capture.captureMs,
      encodeMs: capture.encodeMs,
      visionMs: vision.visionMs,
      totalObserveMs: Date.now() - wall0,
      imageBytes
    }
  }

  return {
    observation: {
      ts: new Date().toISOString(),
      summary: vision.summary,
      usableForPrompt: true
    },
    captureMs: capture.captureMs,
    encodeMs: capture.encodeMs,
    visionMs: vision.visionMs,
    totalObserveMs: Date.now() - wall0,
    imageBytes
  }
}
