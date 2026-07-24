/**
 * 本地下载中断 / 取消 / 关窗调和（OPT-03c）。
 *
 * 职责边界见 `./CONTRACT.md` §文件职责。
 * 与 session 的 stop：通过 `bindLlamaSessionStop` 注入，避免循环 import。
 */
import { join } from 'path'

import { logInfo } from '../logging/logger'

import { DEFAULT_MODEL_FILENAME, MIN_USABLE_GGUF_BYTES } from './constants'
import {
  hasIncompleteModelArtifacts,
  sweepIncompleteModelArtifacts
} from './download'
import { llamaModelsDir } from './paths'

type StopManagedFn = () => Promise<{ ok: boolean }>

let stopManagedLlamaServer: StopManagedFn = async () => ({ ok: true })

/** session 在定义 stopManagedLlamaServer 后调用一次，打破 lifecycle ↔ session 循环依赖。 */
export function bindLlamaSessionStop(fn: StopManagedFn): void {
  stopManagedLlamaServer = fn
}

/** 当前下载的 AbortController；取消下载时 abort，并清理半成品。 */
let activeDownloadAbort: AbortController | null = null

export function beginDownloadAbortScope(): AbortSignal {
  // 不复用可能已卡住的 orphan controller；每次下载新开一把
  if (activeDownloadAbort && !activeDownloadAbort.signal.aborted) {
    activeDownloadAbort.abort()
  }
  activeDownloadAbort = new AbortController()
  return activeDownloadAbort.signal
}

export function endDownloadAbortScope(signal: AbortSignal): void {
  if (activeDownloadAbort?.signal === signal) {
    activeDownloadAbort = null
  }
}

export function defaultLocalModelDest(): string {
  return join(llamaModelsDir(), DEFAULT_MODEL_FILENAME)
}

/** 取消 / 关窗 / 再次进聊天：只清未完成文件，不动完整模型。 */
export function cleanupIncompleteLocalArtifacts(): void {
  const removed = sweepIncompleteModelArtifacts(llamaModelsDir(), {
    minUsableBytes: MIN_USABLE_GGUF_BYTES
  })
  if (removed.length > 0) {
    logInfo('llama', `已清理未完成模型残留: ${removed.join(', ')}`)
  }
}

/**
 * 异常关窗或残留下载后的调和：abort 仍在飞的下载 + 清扫半成品。
 * 下次进聊天 / 再次下载前调用，避免「必须先点一次取消」才能下。
 */
export async function reconcileInterruptedLlamaDownloads(): Promise<{ ok: true; cleaned: boolean }> {
  const hadInflight = Boolean(activeDownloadAbort)
  if (hadInflight) {
    logInfo('llama', 'reconcileInterruptedLlamaDownloads: abort orphan download')
    activeDownloadAbort?.abort()
    activeDownloadAbort = null
  }
  const before = hasIncompleteModelArtifacts(llamaModelsDir(), MIN_USABLE_GGUF_BYTES)
  cleanupIncompleteLocalArtifacts()
  const cleaned = hadInflight || before
  return { ok: true, cleaned }
}

/**
 * 取消进行中的模型 / llama-server 下载：
 * 1) abort 网络请求 2) 清扫未完成模型文件（不删完整模型）3) 停掉本应用启动的 llama-server
 */
export async function cancelLlamaDownload(): Promise<{ ok: true; detail: string }> {
  logInfo('llama', 'cancelLlamaDownload: abort + cleanup + stop managed server')
  activeDownloadAbort?.abort()
  activeDownloadAbort = null
  cleanupIncompleteLocalArtifacts()
  await stopManagedLlamaServer()
  return {
    ok: true,
    detail: '已取消下载，并清理未完成模型与本应用启动的 llama-server'
  }
}

/**
 * 聊天窗关闭（含点 X）：有下载在飞或磁盘半成品 → 等同取消下载；
 * 否则 L-delay：先记忆整理（可调 LLM），再停止本应用托管的 llama-server。
 */
export async function onChatWindowClosed(): Promise<void> {
  const inflight = Boolean(activeDownloadAbort && !activeDownloadAbort.signal.aborted)
  const incomplete = hasIncompleteModelArtifacts(llamaModelsDir(), MIN_USABLE_GGUF_BYTES)
  if (inflight || incomplete) {
    logInfo('llama', 'onChatWindowClosed: interrupted download → cancel + cleanup')
    await cancelLlamaDownload()
    return
  }
  const { runConsolidateThenStopLlama } = await import('../memory/runtime')
  logInfo('llama', 'onChatWindowClosed: L-delay consolidate then stop managed server')
  await runConsolidateThenStopLlama(() => stopManagedLlamaServer())
}

/** 下载 AbortError 后：清半成品并停本应用 llama（供 session catch 使用）。 */
export async function afterDownloadAborted(): Promise<void> {
  cleanupIncompleteLocalArtifacts()
  await stopManagedLlamaServer()
}
