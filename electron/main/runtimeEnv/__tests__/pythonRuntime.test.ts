import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { EMBEDDED_PTH_SITE, ensurePackagedPythonReady, stagePackagedPython, venvPythonExe } from '../pythonRuntime'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xue-py-'))
  dirs.push(dir)
  return dir
}

function writePayload(dir: string): void {
  writeFileSync(join(dir, 'python.exe'), 'exe', 'utf8')
  writeFileSync(join(dir, 'python310.zip'), 'zip', 'utf8')
  writeFileSync(join(dir, 'get-pip.py'), 'pip', 'utf8')
  writeFileSync(join(dir, 'python310._pth'), 'python310.zip\r\n.\r\n#import site\r\n', 'utf8')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('stagePackagedPython', () => {
  it('fails when the installer did not include Python', () => {
    const source = tempDir()
    const data = tempDir()
    const result = stagePackagedPython(source, data)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('安装包未带 Python')
    expect(existsSync(venvPythonExe(data))).toBe(false)
  })

  it('copies the embeddable runtime and enables site-packages', () => {
    const source = tempDir()
    const data = tempDir()
    writePayload(source)
    const result = stagePackagedPython(source, data)
    expect(result.ok).toBe(true)
    const scripts = join(data, '.venv', 'Scripts')
    expect(readFileSync(join(scripts, 'python.exe'), 'utf8')).toBe('exe')
    expect(existsSync(join(scripts, 'python310.zip'))).toBe(true)
    const pth = readFileSync(join(scripts, 'python310._pth'), 'utf8')
    expect(pth).toContain('import site')
    expect(pth).toContain(EMBEDDED_PTH_SITE)
    expect(pth).not.toContain('#import site')
    expect(existsSync(join(data, '.venv', 'Lib', 'site-packages'))).toBe(true)
  })

  it('keeps an interpreter that is already in the data root', () => {
    const source = tempDir()
    const data = tempDir()
    const exe = venvPythonExe(data)
    mkdirSync(join(data, '.venv', 'Scripts'), { recursive: true })
    writeFileSync(exe, 'keep', 'utf8')
    const result = stagePackagedPython(source, data)
    expect(result.ok).toBe(true)
    expect(readFileSync(exe, 'utf8')).toBe('keep')
  })
})

describe('ensurePackagedPythonReady', () => {
  it('installs pip only when the staged interpreter cannot import it', async () => {
    const source = tempDir()
    const data = tempDir()
    writePayload(source)
    const calls: string[][] = []
    const result = await ensurePackagedPythonReady(source, data, async (command, args) => {
      calls.push([command, ...args])
      return args[0] === '-c' ? 1 : 0
    }, () => {})
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.slice(1)).toEqual(['-c', 'import pip'])
    expect(calls[1]?.[1]).toBe(join(source, 'get-pip.py'))
  })
})
