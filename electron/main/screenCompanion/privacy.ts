/**
 * 看屏隐私判断：总开关 / 暂停截止时间 / 进程名黑名单（不看窗口标题）。
 */
import { basename } from 'path'

export type PrivacyGateInput = {
  enabled: boolean
  pausedUntilMs?: number | null
  nowMs?: number
  /** 用户配置的 contains 词 */
  processBlacklist?: string[]
  /** 当前进程 exe 路径列表（调用方枚举后传入） */
  processExePaths?: string[]
}

export type PrivacyGateResult =
  | { allow: true }
  | { allow: false; reason: 'disabled' | 'paused' | 'privacy_filtered'; matched?: string }

export function processFileName(exePath: string): string {
  const normalized = exePath.replace(/\//g, '\\').trim()
  return basename(normalized).toLowerCase()
}

/** 若任一进程文件名 contains 黑名单词，返回命中的词；否则 null */
export function findBlacklistedProcessMatch(
  exePaths: string[],
  blacklist: string[]
): string | null {
  const terms = blacklist.map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (terms.length === 0 || exePaths.length === 0) return null
  for (const p of exePaths) {
    const name = processFileName(p)
    if (!name) continue
    for (const term of terms) {
      if (name.includes(term)) return term
    }
  }
  return null
}

export function evaluatePrivacyGate(input: PrivacyGateInput): PrivacyGateResult {
  if (!input.enabled) {
    return { allow: false, reason: 'disabled' }
  }

  const now = input.nowMs ?? Date.now()
  const until = input.pausedUntilMs
  if (typeof until === 'number' && Number.isFinite(until) && until > now) {
    return { allow: false, reason: 'paused' }
  }

  const matched = findBlacklistedProcessMatch(
    input.processExePaths ?? [],
    input.processBlacklist ?? []
  )
  if (matched) {
    return { allow: false, reason: 'privacy_filtered', matched }
  }

  return { allow: true }
}
