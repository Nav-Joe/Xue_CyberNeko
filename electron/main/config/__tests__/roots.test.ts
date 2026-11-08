import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultSampleDir } from '../paths'
import {
  dataRoot,
  ensureOfficialSampleSeed,
  installRoot,
  resolveAppRoots,
  resolveDevRoot,
  setRootsHostForTests,
  userDataDir,
  type RootsHost
} from '../roots'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xue-roots-'))
  dirs.push(dir)
  return dir
}

function host(partial: Partial<RootsHost> & Pick<RootsHost, 'isPackaged' | 'cwd'>): RootsHost {
  return {
    candidates: partial.candidates ?? [partial.cwd],
    resourcesPath: partial.resourcesPath ?? '',
    localAppData: partial.localAppData ?? '',
    isPackaged: partial.isPackaged,
    cwd: partial.cwd
  }
}

afterEach(() => {
  setRootsHostForTests(null)
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('resolveAppRoots', () => {
  it('uses the directory that has both package.json and voice_forge', () => {
    const cwd = tempDir()
    const repo = tempDir()
    mkdirSync(join(repo, 'voice_forge'), { recursive: true })
    writeFileSync(join(repo, 'package.json'), '{}\n', 'utf8')
    const bare = tempDir()
    writeFileSync(join(bare, 'package.json'), '{}\n', 'utf8')

    const roots = resolveAppRoots(
      host({ isPackaged: false, cwd, candidates: [bare, repo] })
    )
    expect(roots.installRoot).toBe(repo)
    expect(roots.dataRoot).toBe(repo)
  })

  it('falls back to the current directory when no candidate matches', () => {
    const cwd = tempDir()
    const roots = resolveAppRoots(host({ isPackaged: false, cwd, candidates: [tempDir()] }))
    expect(roots.installRoot).toBe(cwd)
    expect(roots.dataRoot).toBe(cwd)
  })

  it('ignores the current directory once the app is packaged', () => {
    const cwd = tempDir()
    mkdirSync(join(cwd, 'voice_forge'), { recursive: true })
    writeFileSync(join(cwd, 'package.json'), '{}\n', 'utf8')
    const resources = tempDir()
    const local = tempDir()
    const roots = resolveAppRoots(
      host({
        isPackaged: true,
        cwd,
        candidates: [cwd],
        resourcesPath: resources,
        localAppData: local
      })
    )
    expect(roots.installRoot).toBe(join(resources, 'app-root'))
    expect(roots.dataRoot).toBe(join(local, 'xue-cyber-neko'))
  })

  it('resolveDevRoot skips a package.json that has no voice_forge', () => {
    const cwd = tempDir()
    const bare = tempDir()
    writeFileSync(join(bare, 'package.json'), '{}\n', 'utf8')
    expect(resolveDevRoot([bare], cwd)).toBe(cwd)
  })
})

describe('ensureOfficialSampleSeed', () => {
  it('copies the official reference when the data root has no wav', () => {
    const install = tempDir()
    const data = tempDir()
    const source = join(install, 'voice_forge', 'default_sample')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'reference.wav'), 'wav', 'utf8')
    writeFileSync(join(source, 'reference.txt'), 'txt', 'utf8')
    writeFileSync(join(source, 'corpus.snapshot.json'), 'cache', 'utf8')

    ensureOfficialSampleSeed(install, data)

    const dest = join(data, 'voice_forge', 'default_sample')
    expect(readFileSync(join(dest, 'reference.wav'), 'utf8')).toBe('wav')
    expect(readFileSync(join(dest, 'reference.txt'), 'utf8')).toBe('txt')
    expect(existsSync(join(dest, 'corpus.snapshot.json'))).toBe(false)
  })

  it('leaves an existing reference wav in place', () => {
    const install = tempDir()
    const data = tempDir()
    const source = join(install, 'voice_forge', 'default_sample')
    const dest = join(data, 'voice_forge', 'default_sample')
    mkdirSync(source, { recursive: true })
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(source, 'reference.wav'), 'new', 'utf8')
    writeFileSync(join(dest, 'reference.wav'), 'keep', 'utf8')

    ensureOfficialSampleSeed(install, data)
    expect(readFileSync(join(dest, 'reference.wav'), 'utf8')).toBe('keep')
  })

  it('does not copy when both roots are the same directory', () => {
    const root = tempDir()
    const source = join(root, 'voice_forge', 'default_sample')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'reference.wav'), 'wav', 'utf8')
    ensureOfficialSampleSeed(root, root)
    expect(existsSync(join(root, 'voice_forge', 'default_sample', 'reference.wav'))).toBe(true)
    expect(existsSync(join(root, 'voice_forge', 'voice_forge'))).toBe(false)
  })
})

describe('userDataDir', () => {
  it('keeps memory and settings under xue-cyber-neko', () => {
    expect(userDataDir(join('C:\\Users\\x\\AppData\\Roaming'))).toBe(
      join('C:\\Users\\x\\AppData\\Roaming', 'xue-cyber-neko')
    )
  })
})

describe('installRoot and dataRoot', () => {
  it('keeps a single root and does not create a data directory when unpackaged', () => {
    const repo = tempDir()
    mkdirSync(join(repo, 'voice_forge'), { recursive: true })
    writeFileSync(join(repo, 'package.json'), '{}\n', 'utf8')
    setRootsHostForTests(host({ isPackaged: false, cwd: repo, candidates: [repo] }))
    expect(installRoot()).toBe(repo)
    expect(dataRoot()).toBe(repo)
    expect(existsSync(join(repo, 'xue-cyber-neko'))).toBe(false)
  })

  it('creates the data directory and copies the seed when packaged', () => {
    const cwd = tempDir()
    const resources = tempDir()
    const local = tempDir()
    const source = join(resources, 'app-root', 'voice_forge', 'default_sample')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'reference.wav'), 'wav', 'utf8')
    writeFileSync(join(source, 'reference.txt'), 'txt', 'utf8')
    setRootsHostForTests(
      host({
        isPackaged: true,
        cwd,
        resourcesPath: resources,
        localAppData: local
      })
    )

    expect(installRoot()).toBe(join(resources, 'app-root'))
    const sample = defaultSampleDir()
    expect(sample).toBe(join(local, 'xue-cyber-neko', 'voice_forge', 'default_sample'))
    expect(readFileSync(join(sample, 'reference.wav'), 'utf8')).toBe('wav')
    expect(existsSync(join(local, 'xue-cyber-neko'))).toBe(true)
  })

  it('finds the repository when no host is injected', () => {
    setRootsHostForTests(null)
    expect(dataRoot()).toBe(installRoot())
    expect(existsSync(join(installRoot(), 'package.json'))).toBe(true)
    expect(existsSync(join(installRoot(), 'voice_forge'))).toBe(true)
  })
})
