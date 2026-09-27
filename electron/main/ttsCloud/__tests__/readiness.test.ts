import { describe, expect, it } from 'vitest'

import { setActiveCloudVoiceForTests } from '../activeVoice'
import { createDefaultTtsCloudConfig } from '../configStore'
import {
  buildQwenEnrollmentUrl,
  buildQwenMultimodalGenerationUrl,
  checkCloudTtsReady
} from '../readiness'

describe('ttsCloud readiness', () => {
  it('buildQwenEnrollmentUrl avoids double paths', () => {
    expect(buildQwenEnrollmentUrl('https://dashscope.aliyuncs.com')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
    )
    expect(buildQwenEnrollmentUrl('https://dashscope.aliyuncs.com/api/v1')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
    )
    expect(
      buildQwenEnrollmentUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
      )
    ).toBe('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization')
  })

  it('buildQwenMultimodalGenerationUrl avoids double paths', () => {
    expect(buildQwenMultimodalGenerationUrl('https://dashscope.aliyuncs.com')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    )
  })

  it('strips pasted clone/synth full URLs back to host before rebuilding', () => {
    expect(
      buildQwenMultimodalGenerationUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
      )
    ).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect(
      buildQwenEnrollmentUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
      )
    ).toBe('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization')
  })

  it('preview allows local backend when credentials and active voice filled', () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'local'
    setActiveCloudVoiceForTests(config, { voiceId: 'voice-a' })
    config.qwen.apiKey = 'sk-test'
    expect(checkCloudTtsReady(config, 'preview')).toEqual({ ok: true })
  })

  it('speak requires qwen backend', () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'local'
    setActiveCloudVoiceForTests(config, { voiceId: 'voice-a' })
    config.qwen.apiKey = 'sk-test'
    const ready = checkCloudTtsReady(config, 'speak')
    expect(ready.ok).toBe(false)
    if (!ready.ok) expect(ready.detail).toContain('本地')
  })

  it('rejects missing apiKey / active voice', () => {
    const config = createDefaultTtsCloudConfig()
    config.ttsBackend = 'qwen'
    expect(checkCloudTtsReady(config, 'preview').ok).toBe(false)
    config.qwen.apiKey = 'k'
    expect(checkCloudTtsReady(config, 'preview').ok).toBe(false)
    const missingVoice = checkCloudTtsReady(config, 'preview')
    if (!missingVoice.ok) {
      expect(missingVoice.detail).toContain('克隆')
    }
    setActiveCloudVoiceForTests(config, { voiceId: 'v' })
    expect(checkCloudTtsReady(config, 'preview')).toEqual({ ok: true })
  })
})
