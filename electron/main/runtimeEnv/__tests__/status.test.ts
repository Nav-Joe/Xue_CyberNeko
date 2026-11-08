import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { formatInstalledBytes, sumInstalledBytes } from '../size'
import { live2dModelFiles, readRuntimeEnvStatus } from '../status'

const temps: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'xue-runtime-env-'))
  temps.push(root)
  return root
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('installed byte size', () => {
  it('sums real files and formats without an estimate word', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'public', 'models', 'hiyori_pro'), { recursive: true })
    writeFileSync(join(root, 'public', 'models', 'hiyori_pro', 'a.bin'), Buffer.alloc(2 * 1024 * 1024))

    const bytes = sumInstalledBytes(root, [{ path: join('public', 'models', 'hiyori_pro') }])
    expect(bytes).toBe(2 * 1024 * 1024)
    expect(formatInstalledBytes(bytes ?? 0)).toBe('2.0 MB')
    expect(sumInstalledBytes(root, [{ path: 'missing-dir' }])).toBeNull()
  })
})

describe('runtime env live2d status', () => {
  it('treats a self-provided model as installed and blocks removing a missing official sample', () => {
    const root = makeRoot()
    const custom = join(root, 'public', 'models', 'mine')
    mkdirSync(custom, { recursive: true })
    writeFileSync(join(custom, 'a.model3.json'), '{}')

    const live = live2dModelFiles(root)
    expect(live.official).toBe(false)
    expect(live.others).toHaveLength(1)

    const item = readRuntimeEnvStatus(root).find((row) => row.id === 'live2d-model')
    expect(item?.installed).toBe(true)
    expect(item?.required).toBe(true)
    expect(item?.canUninstall).toBe(false)
    expect(item?.canInstall).toBe(false)
  })

  it('allows removing the official sample only when another model remains', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'public', 'models', 'hiyori_pro', 'runtime'), { recursive: true })
    writeFileSync(join(root, 'public', 'models', 'hiyori_pro', 'runtime', 'hiyori_pro_t11.model3.json'), '{}')
    mkdirSync(join(root, 'public', 'models', 'mine'), { recursive: true })
    writeFileSync(join(root, 'public', 'models', 'mine', 'b.model3.json'), '{}')

    const item = readRuntimeEnvStatus(root).find((row) => row.id === 'live2d-model')
    expect(item?.canUninstall).toBe(true)
    expect(item?.license?.url).toContain('live2d-free-material-license-agreement')
  })

  it('blocks uninstall when the official sample is the only model', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'public', 'models', 'hiyori_pro', 'runtime'), { recursive: true })
    writeFileSync(join(root, 'public', 'models', 'hiyori_pro', 'runtime', 'hiyori_pro_t11.model3.json'), '{}')

    const item = readRuntimeEnvStatus(root).find((row) => row.id === 'live2d-model')
    expect(item?.installed).toBe(true)
    expect(item?.canUninstall).toBe(false)
    expect(item?.uninstallBlockedReason).toContain('唯一')
  })
})
