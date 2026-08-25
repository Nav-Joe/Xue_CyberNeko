import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import {
  clampIntervalSecUi,
  cloneScreenCompanionConfig,
  saveScreenCompanionConfig
} from '../screenCompanionStore'

describe('clampIntervalSecUi', () => {
  it('clamps to 30-600', () => {
    expect(clampIntervalSecUi(10)).toBe(30)
    expect(clampIntervalSecUi(90)).toBe(90)
    expect(clampIntervalSecUi(9999)).toBe(600)
  })
})

describe('cloneScreenCompanionConfig', () => {
  it('strips Vue reactive proxies for IPC', () => {
    const raw = cloneScreenCompanionConfig(
      reactive({
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: ['obs64'],
        intervalSec: 30,
        visionBaseUrl: 'https://example/v1',
        visionModel: 'gpt-4o',
        hasVisionApiKey: true,
        visionApiKeySecretSave: false
      })
    )
    expect(raw.intervalSec).toBe(30)
    expect(raw.processBlacklist).toEqual(['obs64'])
    expect(Object.getPrototypeOf(raw)).toBe(Object.prototype)
  })
})

describe('saveScreenCompanionConfig', () => {
  it('passes plain payload over IPC', async () => {
    const write = vi.fn(async () => ({
      ok: true as const,
      config: {
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: [],
        intervalSec: 45,
        visionBaseUrl: '',
        visionModel: '',
        hasVisionApiKey: false,
        visionApiKeySecretSave: false
      }
    }))
    window.electronAPI = { screenCompanionWriteConfig: write } as typeof window.electronAPI

    await saveScreenCompanionConfig(
      reactive({
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: [],
        intervalSec: 45,
        visionBaseUrl: '',
        visionModel: '',
        hasVisionApiKey: false,
        visionApiKeySecretSave: false
      })
    )

    expect(write).toHaveBeenCalledOnce()
    const payload = write.mock.calls[0][0]
    expect(payload.intervalSec).toBe(45)
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
  })
})
