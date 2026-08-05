import { describe, expect, it } from 'vitest'

import {
  buildDiskApiKeyFields,
  resolveApiKeyFromDisk,
  type ApiKeyCrypto
} from '../apiKeyAtRest'

function fakeCrypto(map: Map<string, string> = new Map()): ApiKeyCrypto {
  let n = 0
  return {
    isAvailable: () => true,
    encrypt: (plain: string) => {
      const token = `enc-${++n}-${plain}`
      map.set(token, plain)
      return token
    },
    decrypt: (encB64: string) => map.get(encB64) ?? null
  }
}

describe('apiKeyAtRest', () => {
  it('migrates plaintext to enc on resolve', () => {
    const crypto = fakeCrypto()
    const resolved = resolveApiKeyFromDisk({ apiKey: 'sk-test' }, crypto)
    expect(resolved.plain).toBe('sk-test')
    expect(resolved.shouldRewrite).toBe(true)

    const disk = buildDiskApiKeyFields(resolved.plain, crypto)
    expect(disk.apiKey).toBe('')
    expect(disk.apiKeyEnc).toMatch(/^enc-/)
  })

  it('decrypts apiKeyEnc and clears leftover plaintext flag', () => {
    const store = new Map<string, string>()
    const crypto = fakeCrypto(store)
    const enc = crypto.encrypt('sk-secret')!
    const resolved = resolveApiKeyFromDisk({ apiKey: 'sk-secret', apiKeyEnc: enc }, crypto)
    expect(resolved.plain).toBe('sk-secret')
    expect(resolved.shouldRewrite).toBe(true)
  })

  it('returns empty when enc decrypt fails', () => {
    const crypto = fakeCrypto()
    const resolved = resolveApiKeyFromDisk({ apiKeyEnc: 'bogus' }, crypto)
    expect(resolved.plain).toBe('')
    expect(resolved.shouldRewrite).toBe(false)
  })

  it('falls back to plaintext when encrypt unavailable', () => {
    const crypto: ApiKeyCrypto = {
      isAvailable: () => false,
      encrypt: () => null,
      decrypt: () => null
    }
    const disk = buildDiskApiKeyFields('sk-plain', crypto)
    expect(disk).toEqual({ apiKey: 'sk-plain' })
  })

  it('clears both fields when key empty', () => {
    const disk = buildDiskApiKeyFields('  ', fakeCrypto())
    expect(disk).toEqual({ apiKey: '' })
  })
})
