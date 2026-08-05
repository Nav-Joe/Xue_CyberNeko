/**
 * API Key 落盘：Electron safeStorage（OS 凭据/DPAPI）整串加解密。
 * 不可用时回退明文并打日志，避免丢 Key；开源桌宠不做重型自管密钥。
 *
 * 注意：不在模块顶层 import electron，便于 vitest 测纯函数。
 */

export type ApiKeyDiskFields = {
  apiKey?: string
  apiKeyEnc?: string
}

export type ApiKeyCrypto = {
  isAvailable: () => boolean
  encrypt: (plain: string) => string | null
  decrypt: (encB64: string) => string | null
}

let warnedUnavailable = false

export function createSafeStorageApiKeyCrypto(): ApiKeyCrypto {
  const loadSafeStorage = (): typeof import('electron').safeStorage | null => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('electron').safeStorage as typeof import('electron').safeStorage
    } catch {
      return null
    }
  }

  return {
    isAvailable: () => {
      try {
        return loadSafeStorage()?.isEncryptionAvailable() === true
      } catch {
        return false
      }
    },
    encrypt: (plain: string) => {
      if (!plain) return null
      try {
        const safeStorage = loadSafeStorage()
        if (!safeStorage?.isEncryptionAvailable()) return null
        return safeStorage.encryptString(plain).toString('base64')
      } catch {
        return null
      }
    },
    decrypt: (encB64: string) => {
      if (!encB64.trim()) return null
      try {
        const safeStorage = loadSafeStorage()
        if (!safeStorage) return null
        return safeStorage.decryptString(Buffer.from(encB64, 'base64'))
      } catch {
        return null
      }
    }
  }
}

/** 从磁盘字段还原内存明文；若仍有明文或需补写密文则标记 rewrite */
export function resolveApiKeyFromDisk(
  raw: ApiKeyDiskFields,
  crypto: ApiKeyCrypto
): { plain: string; shouldRewrite: boolean } {
  const enc = typeof raw.apiKeyEnc === 'string' ? raw.apiKeyEnc.trim() : ''
  const legacyPlain = typeof raw.apiKey === 'string' ? raw.apiKey : ''

  if (enc) {
    const decrypted = crypto.decrypt(enc)
    if (decrypted != null) {
      // 密文可读：清掉历史明文残留
      return { plain: decrypted, shouldRewrite: Boolean(legacyPlain.trim()) }
    }
    // 密文损坏：保留磁盘字段不改写，内存无 Key，用户需重填
    return { plain: '', shouldRewrite: false }
  }

  if (legacyPlain.trim()) {
    return { plain: legacyPlain, shouldRewrite: true }
  }

  return { plain: '', shouldRewrite: false }
}

/** 写出磁盘字段：优先 apiKeyEnc，加密不可用则明文 apiKey */
export function buildDiskApiKeyFields(
  plain: string,
  crypto: ApiKeyCrypto
): { apiKey: string; apiKeyEnc?: string } {
  const trimmed = plain.trim()
  if (!trimmed) {
    return { apiKey: '' }
  }

  const enc = crypto.encrypt(trimmed)
  if (enc) {
    return { apiKey: '', apiKeyEnc: enc }
  }

  if (!warnedUnavailable && !crypto.isAvailable()) {
    warnedUnavailable = true
    console.warn(
      '[chat-config] safeStorage encryption unavailable; API key will be stored in plaintext'
    )
  }
  return { apiKey: trimmed }
}
