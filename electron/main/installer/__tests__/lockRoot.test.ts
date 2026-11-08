import { createRequire } from 'node:module'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveLockRoot } = require('../../../../scripts/app-instance-lock.js') as {
  resolveLockRoot: (scriptDir: string, envValue: string | undefined) => string
}

describe('resolveLockRoot', () => {
  it('uses the parent of scripts when the startup bat does not pass a data root', () => {
    const scriptDir = join('D:\\repo\\scripts')
    expect(resolveLockRoot(scriptDir, undefined)).toBe(resolve(scriptDir, '..'))
    expect(resolveLockRoot(scriptDir, '  ')).toBe(resolve(scriptDir, '..'))
  })

  it('uses the data root when the packaged app passes it', () => {
    const data = join('C:\\Users\\x\\AppData\\Local\\xue-cyber-neko')
    expect(resolveLockRoot(join('C:\\app\\resources\\app.asar\\scripts'), data)).toBe(data)
  })
})
