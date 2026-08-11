import { describe, expect, it, vi } from 'vitest'

import { createDefaultChatConfig } from '../../../../src/services/chat/chatConfigDefaults'
import type { ChatConfig } from '../../../../src/services/chat/types'
import { normalizeConfig } from '../chatConfigNormalize'

// chat-config 顶层 import electron；测 View 时 mock 即可，勿碰真实 userData
vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:\\tmp\\xue-cyber-neko-chat-config-test'
  }
}))

import { toChatConfigView } from '../chat-config'

describe('normalizeConfig', () => {
  it('fills missing fields from product defaults', () => {
    const defaults = createDefaultChatConfig()
    const got = normalizeConfig({})
    expect(got.llmMode).toBe(defaults.llmMode)
    expect(got.local.selectedBaseUrl).toBe(defaults.local.selectedBaseUrl)
    expect(got.openai.baseUrl).toBe(defaults.openai.baseUrl)
    expect(got.ttsEnabled).toBe(defaults.ttsEnabled)
    expect(got.ttsParallelEnabled).toBe(defaults.ttsParallelEnabled)
    expect(got.ttsParallelLanes).toBe(defaults.ttsParallelLanes)
    expect(got.memoryEnabled).toBe(defaults.memoryEnabled)
    expect(got.desireEnabled).toBe(defaults.desireEnabled)
    expect(got.sttEnabled).toBe(defaults.sttEnabled)
    expect(got.sttAutoSend).toBe(defaults.sttAutoSend)
    expect(got.apiKey).toBe(defaults.apiKey)
  })

  it('rejects illegal types and falls back to defaults', () => {
    const defaults = createDefaultChatConfig()
    const got = normalizeConfig({
      local: {
        selectedBaseUrl: '  http://ok  ',
        selectedModelId: 'm',
        outputFormat: 'openai',
        temperature: 0.3
      },
      openai: {
        baseUrl: 'https://api.example/v1',
        model: 'gpt',
        outputFormat: 'openai',
        temperature: 0.4
      },
      // 脏类型：应回落 defaults，不应原样写入
      ttsEnabled: 'yes' as unknown as boolean,
      ttsParallelLanes: 9 as unknown as 2,
      temperature: 'hot' as unknown as number,
      sttEnabled: 1 as unknown as boolean,
      sttBaseUrl: 123 as unknown as string,
      memoryEnabled: 'true' as unknown as boolean
    })
    expect(got.local.selectedBaseUrl).toBe('http://ok')
    expect(got.local.temperature).toBe(0.3)
    expect(got.ttsEnabled).toBe(defaults.ttsEnabled)
    expect(got.ttsParallelLanes).toBe(defaults.ttsParallelLanes)
    expect(got.sttEnabled).toBe(defaults.sttEnabled)
    expect(got.sttBaseUrl).toBe(defaults.sttBaseUrl)
    expect(got.memoryEnabled).toBe(defaults.memoryEnabled)
  })

  it('migrates legacy flat fields into local/openai', () => {
    const got = normalizeConfig({
      llmMode: 'openai_api',
      model: 'legacy-model',
      llamaBaseUrl: 'http://127.0.0.1:9999',
      openaiBaseUrl: 'https://legacy.example/v1',
      outputFormat: 'json_content',
      temperature: 0.2
    })
    expect(got.llmMode).toBe('openai_api')
    expect(got.local.selectedBaseUrl).toBe('http://127.0.0.1:9999')
    expect(got.openai.baseUrl).toBe('https://legacy.example/v1')
    expect(got.openai.model).toBe('legacy-model')
    expect(got.local.selectedModelId).toBe(createDefaultChatConfig().local.selectedModelId)
    expect(got.openai.outputFormat).toBe('json_content')
    expect(got.openai.temperature).toBe(0.2)
  })
})

describe('toChatConfigView boolean gates', () => {
  function viewOf(patch: Partial<ChatConfig>) {
    return toChatConfigView({ ...createDefaultChatConfig(), ...patch })
  }

  it('uses === true for default-off fields (stt)', () => {
    expect(viewOf({ sttEnabled: true }).sttEnabled).toBe(true)
    expect(viewOf({ sttEnabled: false }).sttEnabled).toBe(false)
    // 脏值不得误开
    expect(
      toChatConfigView({
        ...createDefaultChatConfig(),
        sttEnabled: undefined as unknown as boolean
      }).sttEnabled
    ).toBe(false)
    expect(
      toChatConfigView({
        ...createDefaultChatConfig(),
        sttEnabled: 'yes' as unknown as boolean
      }).sttEnabled
    ).toBe(false)
  })

  it('uses !== false for default-on fields (desire)', () => {
    expect(viewOf({ desireEnabled: true }).desireEnabled).toBe(true)
    expect(viewOf({ desireEnabled: false }).desireEnabled).toBe(false)
    // 缺省/脏值偏向开，防误关
    expect(
      toChatConfigView({
        ...createDefaultChatConfig(),
        desireEnabled: undefined as unknown as boolean
      }).desireEnabled
    ).toBe(true)
    expect(
      toChatConfigView({
        ...createDefaultChatConfig(),
        desireEnabled: 'no' as unknown as boolean
      }).desireEnabled
    ).toBe(true)
  })

  it('keeps memoryEnabled strict on View after normalize filled default true', () => {
    const normalized = normalizeConfig({})
    expect(normalized.memoryEnabled).toBe(true)
    expect(toChatConfigView(normalized).memoryEnabled).toBe(true)

    expect(
      toChatConfigView({
        ...createDefaultChatConfig(),
        memoryEnabled: undefined as unknown as boolean
      }).memoryEnabled
    ).toBe(false)
  })
})
