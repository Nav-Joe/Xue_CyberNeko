import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../chatTtsGate', () => ({
  isChatTtsEnabledForCompanion: () => true
}))

import type { NativeImage } from 'electron'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { evaluatePrivacyGate, findBlacklistedProcessMatch } from '../privacy'
import { observePrimaryScreen } from '../observe'
import { summarizeScreenImage } from '../visionSummary'
import {
  applyScreenCompanionConfigWrite,
  normalizeScreenCompanionConfig,
  setScreenCompanionConfigTestHooks,
  toScreenCompanionConfigView,
  writeScreenCompanionConfig,
  readScreenCompanionConfig,
  DEFAULT_SCREEN_COMPANION_CONFIG,
  type ScreenCompanionConfigWritePayload
} from '../configStore'

const EMPTY_VISION = { baseUrl: '', apiKey: '', model: '' } as const

function fakeImage(jpeg: Buffer): NativeImage {
  return {
    isEmpty: () => false,
    toPNG: () => Buffer.from([0x89]),
    toJPEG: () => jpeg
  } as unknown as NativeImage
}

describe('privacy gate', () => {
  it('blocks when disabled', () => {
    expect(evaluatePrivacyGate({ enabled: false })).toEqual({ allow: false, reason: 'disabled' })
  })

  it('blocks when paused', () => {
    expect(
      evaluatePrivacyGate({ enabled: true, pausedUntilMs: 2000, nowMs: 1000 })
    ).toEqual({ allow: false, reason: 'paused' })
  })

  it('blocks on process blacklist contains', () => {
    expect(
      findBlacklistedProcessMatch(
        ['C:\\Program Files\\1Password\\1Password.exe'],
        ['1password']
      )
    ).toBe('1password')
    expect(
      evaluatePrivacyGate({
        enabled: true,
        processBlacklist: ['1password'],
        processExePaths: ['C:\\Program Files\\1Password\\1Password.exe']
      })
    ).toMatchObject({ allow: false, reason: 'privacy_filtered', matched: '1password' })
  })

  it('allows when enabled and not paused/blacklisted', () => {
    expect(evaluatePrivacyGate({ enabled: true })).toEqual({ allow: true })
  })
})

describe('summarizeScreenImage', () => {
  it('fails fast when apiKey empty without fetch', async () => {
    const fetchImpl = vi.fn()
    const result = await summarizeScreenImage({
      imageBytes: Buffer.from([1, 2, 3]),
      mimeType: 'image/jpeg',
      config: { ...EMPTY_VISION, model: 'x' },
      deps: { fetchImpl: fetchImpl as unknown as typeof fetch }
    })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('parses text content and does not require disk', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '屏幕上是桌面和几个窗口。' } }]
      })
    }))
    const result = await summarizeScreenImage({
      imageBytes: Buffer.from([1, 2, 3]),
      mimeType: 'image/jpeg',
      config: { baseUrl: 'https://example.test/v1', apiKey: 'sk', model: 'vision-x' },
      deps: { fetchImpl: fetchImpl as unknown as typeof fetch }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary).toContain('桌面')
    }
  })
})

describe('observePrimaryScreen', () => {
  it('skips capture when disabled', async () => {
    const result = await observePrimaryScreen({
      enabled: false,
      vision: { baseUrl: 'https://x', apiKey: 'k', model: 'm' }
    })
    expect(result.observation.skipped).toBe('disabled')
  })

  it('skips when vision unconfigured without capturing', async () => {
    const getSources = vi.fn()
    const result = await observePrimaryScreen({
      enabled: true,
      vision: { baseUrl: '', apiKey: '', model: '' },
      capture: {
        deps: {
          getPrimaryWorkArea: () => ({ width: 100, height: 100 }),
          getSources
        }
      }
    })
    expect(result.observation.skipped).toBe('vision_unconfigured')
    expect(getSources).not.toHaveBeenCalled()
  })

  it('skips on blacklist before capture', async () => {
    const getSources = vi.fn()
    const result = await observePrimaryScreen({
      enabled: true,
      processBlacklist: ['keepass'],
      vision: { baseUrl: 'https://x', apiKey: 'k', model: 'm' },
      deps: {
        listProcessExecutablePaths: async () => ['D:\\Apps\\KeePass\\KeePass.exe']
      },
      capture: {
        deps: {
          getPrimaryWorkArea: () => ({ width: 100, height: 100 }),
          getSources
        }
      }
    })
    expect(result.observation.skipped).toBe('privacy_filtered')
    expect(getSources).not.toHaveBeenCalled()
  })

  it('returns summary text when capture+vision mocked', async () => {
    const jpeg = Buffer.from([0xff, 0xd8])
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '正在玩射击游戏，界面有血条。' } }]
      })
    }))
    const result = await observePrimaryScreen({
      enabled: true,
      vision: { baseUrl: 'https://example.test/v1', apiKey: 'sk', model: 'vision-x' },
      visionDeps: { fetchImpl: fetchImpl as unknown as typeof fetch },
      capture: {
        deps: {
          getPrimaryWorkArea: () => ({ width: 1920, height: 1080 }),
          getSources: async () => [
            { id: 'screen:0', name: 'Screen', thumbnail: fakeImage(jpeg) }
          ]
        }
      }
    })
    expect(result.observation.skipped).toBeUndefined()
    expect(result.observation.summary).toContain('射击')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('configStore', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xue-sc-cfg-'))
    setScreenCompanionConfigTestHooks({
      configPath: join(dir, 'screen-companion-config.json'),
      crypto: {
        isAvailable: () => true,
        encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8').toString('base64'),
        decrypt: (b64) => {
          const s = Buffer.from(b64, 'base64').toString('utf8')
          return s.startsWith('enc:') ? s.slice(4) : null
        }
      }
    })
  })

  afterEach(() => {
    setScreenCompanionConfigTestHooks({ configPath: null, crypto: null })
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes encrypted vision key; view returns plaintext only when secret save off', () => {
    const saved = writeScreenCompanionConfig({
      ...DEFAULT_SCREEN_COMPANION_CONFIG,
      enabled: true,
      processBlacklist: ['1password'],
      visionApiKeySecretSave: false,
      vision: { baseUrl: 'https://relay.example/v1', model: 'gpt-4o', apiKey: 'sk-secret' }
    })
    const disk = JSON.parse(readFileSync(join(dir, 'screen-companion-config.json'), 'utf8')) as {
      vision: { apiKey?: string; apiKeyEnc?: string }
      visionApiKeySecretSave?: boolean
    }
    expect(disk.vision.apiKey).toBe('')
    expect(disk.vision.apiKeyEnc).toBeTruthy()
    expect(disk.visionApiKeySecretSave).toBe(false)
    const openView = toScreenCompanionConfigView(saved)
    expect(openView.hasVisionApiKey).toBe(true)
    expect(openView.visionApiKey).toBe('sk-secret')
    expect(openView.visionBaseUrl).toBe('https://relay.example/v1')

    const secretSaved = writeScreenCompanionConfig({
      ...saved,
      visionApiKeySecretSave: true
    })
    const secretView = toScreenCompanionConfigView(secretSaved)
    expect(secretView.hasVisionApiKey).toBe(true)
    expect(secretView.visionApiKey).toBeUndefined()
    expect(secretView.visionApiKeySecretSave).toBe(true)

    const loaded = readScreenCompanionConfig()
    expect(loaded.vision.apiKey).toBe('sk-secret')
    expect(loaded.enabled).toBe(true)
  })

  it('persists intervalSec to disk and reloads', () => {
    writeScreenCompanionConfig({
      ...DEFAULT_SCREEN_COMPANION_CONFIG,
      enabled: true,
      intervalSec: 120
    })
    const disk = JSON.parse(readFileSync(join(dir, 'screen-companion-config.json'), 'utf8')) as {
      intervalSec?: number
    }
    expect(disk.intervalSec).toBe(120)
    expect(readScreenCompanionConfig().intervalSec).toBe(120)
    expect(toScreenCompanionConfigView(readScreenCompanionConfig()).intervalSec).toBe(120)
  })

  it('apply write preserves interval when payload omits intervalSec', () => {
    const next = applyScreenCompanionConfigWrite(
      {
        enabled: false,
        pausedUntilMs: null,
        processBlacklist: [],
        intervalSec: 150,
        visionApiKeySecretSave: false,
        vision: { baseUrl: 'https://x', model: 'm', apiKey: '' }
      },
      {
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: [],
        visionBaseUrl: 'https://x',
        visionModel: 'm',
        hasVisionApiKey: false,
        visionApiKeySecretSave: false
      } as ScreenCompanionConfigWritePayload
    )
    expect(next.intervalSec).toBe(150)
  })

  it('apply write can clear key', () => {
    const next = applyScreenCompanionConfigWrite(
      {
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: [],
        intervalSec: 90,
        visionApiKeySecretSave: true,
        vision: { baseUrl: 'https://x', model: 'm', apiKey: 'keep' }
      },
      {
        enabled: true,
        pausedUntilMs: null,
        processBlacklist: [],
        intervalSec: 90,
        visionBaseUrl: 'https://x',
        visionModel: 'm',
        hasVisionApiKey: true,
        visionApiKeySecretSave: true,
        clearVisionApiKey: true
      }
    )
    expect(next.vision.apiKey).toBe('')
    expect(next.visionApiKeySecretSave).toBe(true)
  })

  it('defaults enabled false and visionApiKeySecretSave false', () => {
    const { config } = normalizeScreenCompanionConfig({})
    expect(config.enabled).toBe(false)
    expect(config.visionApiKeySecretSave).toBe(false)
  })
})
