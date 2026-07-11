import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppBoot } from '../useAppBoot'
import { loadTtsCapabilities } from '../../../services/ttsCapabilities'
import { fetchVoiceForgeStatus } from '../../../services/voiceForgeApi'

vi.mock('../../../services/ttsCapabilities')
vi.mock('../../../services/voiceForgeApi')
vi.mock('../../../services/touchModeSettings', () => ({ getTouchFeedbackMode: vi.fn(() => 'curated') }))
vi.mock('../../../services/audioCache', () => ({ fetchCacheStatus: vi.fn() }))

describe('useAppBoot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('voiceForge unsupported finishes ready', async () => {
    vi.mocked(loadTtsCapabilities).mockResolvedValue({
      configuredEngine: 'style-bert-vits2', effectiveEngine: 'style-bert-vits2',
      voiceForgeSupported: false, altEngineCorpusSupported: true,
      configMismatch: false, hint: null, altEngineHint: null, engineStatusLine: null
    })
    const boot = useAppBoot()
    await boot.evaluateInitialBoot()
    expect(boot.phase.value).toBe('ready')
  })

  it('generating voice forge status enters generating boot', async () => {
    vi.mocked(loadTtsCapabilities).mockResolvedValue({
      configuredEngine: 'qwen', effectiveEngine: 'qwen', voiceForgeSupported: true,
      altEngineCorpusSupported: false, configMismatch: false,
      hint: null, altEngineHint: null, engineStatusLine: null
    })
    vi.mocked(fetchVoiceForgeStatus).mockResolvedValue({
      review_pending: false, phase: 'generating', flow: 'create_voice',
      displayName: null, folderId: null, reference_ready: true, ready: false
    })
    const boot = useAppBoot()
    await boot.evaluateInitialBoot()
    expect(boot.phase.value).toBe('generating')
  })
})
