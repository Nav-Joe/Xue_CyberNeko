import { describe, expect, it } from 'vitest'

import { setActiveCloudVoiceForTests } from '../activeVoice'
import { createDefaultTtsCloudConfig } from '../configStore'
import {
  buildAliSpeechSynthesizeUrl,
  buildQwenEnrollmentUrl,
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

  it('buildAliSpeechSynthesizeUrl avoids double paths', () => {
    expect(buildAliSpeechSynthesizeUrl('https://dashscope.aliyuncs.com')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
    )
    expect(buildAliSpeechSynthesizeUrl('https://dashscope.aliyuncs.com/api/v1')).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
    )
  })

  it('rewrites the retired multimodal URL and keeps an explicit SpeechSynthesizer URL', () => {
    const synth = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
    const legacy =
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    expect(buildAliSpeechSynthesizeUrl(synth)).toBe(synth)
    expect(buildAliSpeechSynthesizeUrl(legacy)).toBe(synth)
    expect(buildQwenEnrollmentUrl(synth)).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
    )
    expect(buildAliSpeechSynthesizeUrl('https://dashscope-intl.aliyuncs.com')).toBe(
      'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
    )
    expect(
      buildAliSpeechSynthesizeUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
      )
    ).toBe(synth)
    expect(buildQwenEnrollmentUrl(legacy)).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
    )
    expect(
      buildAliSpeechSynthesizeUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SomeOtherApi'
      )
    ).toBe(synth)
    expect(
      buildAliSpeechSynthesizeUrl('https://ws1.cn-beijing.maas.aliyuncs.com')
    ).toBe('https://ws1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer')
  })

  it('refuses to attach a request to a non-Aliyun host', () => {
    expect(buildAliSpeechSynthesizeUrl('https://evil.example/api/v1')).toBe('')
    expect(buildQwenEnrollmentUrl('http://dashscope.aliyuncs.com')).toBe('')
    expect(buildAliSpeechSynthesizeUrl('https://user:pw@dashscope.aliyuncs.com')).toBe('')
    expect(buildAliSpeechSynthesizeUrl('not a url')).toBe('')
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
