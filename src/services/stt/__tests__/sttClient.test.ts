import { afterEach, describe, expect, it, vi } from 'vitest'

import { STT_PORT_CANDIDATES } from '../constants'
import { recognizeWav, resolveSttBaseUrl, SttClientError } from '../sttClient'

describe('sttClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('resolveSttBaseUrl uses configured URL without scanning ports', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, service: 'stt', modelReady: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const base = await resolveSttBaseUrl('http://127.0.0.1:8768/')
    expect(base).toBe('http://127.0.0.1:8768')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('8768/health')
  })

  it('resolveSttBaseUrl scans candidate ports until health matches', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('8767')) {
        return { ok: false, json: async () => ({}) }
      }
      if (String(url).includes('8768')) {
        return {
          ok: true,
          json: async () => ({ ok: true, service: 'stt', modelReady: true })
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const base = await resolveSttBaseUrl('')
    expect(base).toBe('http://127.0.0.1:8768')
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(STT_PORT_CANDIDATES.length)
  })

  it('resolveSttBaseUrl throws when no sidecar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('failed'))
    )
    await expect(resolveSttBaseUrl('')).rejects.toBeInstanceOf(SttClientError)
  })

  it('recognizeWav posts multipart and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, text: '你好' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await recognizeWav(
      'http://127.0.0.1:8767',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })
    )
    expect(result.text).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('recognizeWav maps unreachable fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(
      recognizeWav('http://127.0.0.1:8767', new Blob())
    ).rejects.toMatchObject({ code: 'unreachable' })
  })
})
