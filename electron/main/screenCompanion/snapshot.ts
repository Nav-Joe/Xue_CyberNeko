/**
 * 屏幕观察内存快照：只保留最新一条文字摘要（不落盘、不带图）。
 */
import type { ScreenObservation } from './types'

let latest: ScreenObservation | null = null

export function getLatestObservation(): ScreenObservation | null {
  return latest
}

export function setLatestObservation(observation: ScreenObservation): void {
  latest = observation
}

/** 单测复位 */
export function clearLatestObservation(): void {
  latest = null
}
