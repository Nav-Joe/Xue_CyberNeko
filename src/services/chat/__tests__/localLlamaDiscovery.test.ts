import { describe, expect, it, vi } from 'vitest'

import { detectLocalLlamaEndpoints, probeLocalLlamaEndpoint } from '../localLlamaDiscovery'

describe('localLlamaDiscovery', () => {
  it('returns online endpoint with models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'qwen-local' }] })
      })
    )

    const endpoint = await probeLocalLlamaEndpoint('http://127.0.0.1:8080')
    expect(endpoint.online).toBe(true)
    expect(endpoint.models).toEqual(['qwen-local'])
    vi.unstubAllGlobals()
  })

  it('returns offline endpoint on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const endpoint = await probeLocalLlamaEndpoint('http://127.0.0.1:9099')
    expect(endpoint.online).toBe(false)
    expect(endpoint.models).toEqual([])
    vi.unstubAllGlobals()
  })

  it('dedupes scan targets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] })
      })
    )

    const list = await detectLocalLlamaEndpoints(['http://127.0.0.1:8080', 'http://127.0.0.1:8080'])
    const customCount = list.filter((item) => item.baseUrl === 'http://127.0.0.1:8080').length
    expect(customCount).toBe(1)
    vi.unstubAllGlobals()
  })
})
