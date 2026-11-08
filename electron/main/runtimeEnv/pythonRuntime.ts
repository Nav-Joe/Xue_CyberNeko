import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

/**
 * 官方嵌入版没有 venv 模块，不能 python -m venv。
 * 解释器放在 .venv\Scripts，site-packages 放在 .venv\Lib，体积统计已经认这个位置。
 * ._pth 里的路径相对 python.exe，所以要写成 ..\Lib\site-packages。
 */
export const EMBEDDED_PTH_SITE = '..\\Lib\\site-packages'

const PAYLOAD_FILES = ['python.exe', 'python310.zip', 'python310._pth', 'get-pip.py'] as const

export function packagedPythonSourceDir(installRoot: string): string {
  return resolve(installRoot, '..', 'python')
}

export function venvPythonExe(dataRoot: string): string {
  return join(dataRoot, '.venv', 'Scripts', 'python.exe')
}

export function enableEmbeddedSite(pthText: string): string {
  const kept: string[] = []
  let sawPackages = false
  for (const line of pthText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '#import site' || trimmed === '# import site' || trimmed === 'import site') continue
    if (trimmed.replace(/\//g, '\\') === EMBEDDED_PTH_SITE) sawPackages = true
    if (trimmed.length > 0) kept.push(line)
  }
  if (!sawPackages) kept.push(EMBEDDED_PTH_SITE)
  // import site 放在路径后面，site-packages 才会被加进搜索路径。
  kept.push('import site')
  return `${kept.join('\r\n')}\r\n`
}

export type StagePythonResult =
  | { ok: true; pythonExe: string; getPipPath: string }
  | { ok: false; detail: string }

/** 把安装目录旁的嵌入版拷到数据根。解释器已经在时不再覆盖。 */
export function stagePackagedPython(sourceDir: string, dataRoot: string): StagePythonResult {
  const pythonExe = venvPythonExe(dataRoot)
  const getPipPath = join(sourceDir, 'get-pip.py')
  if (existsSync(pythonExe)) {
    return { ok: true, pythonExe, getPipPath }
  }

  const missing = PAYLOAD_FILES.filter((name) => !existsSync(join(sourceDir, name)))
  if (missing.length > 0) {
    return { ok: false, detail: `安装包未带 Python（缺少 ${missing.join('、')}）。` }
  }

  const destDir = join(dataRoot, '.venv', 'Scripts')
  mkdirSync(destDir, { recursive: true })
  mkdirSync(join(dataRoot, '.venv', 'Lib', 'site-packages'), { recursive: true })
  for (const name of readdirSync(sourceDir)) {
    const from = join(sourceDir, name)
    if (!statSync(from).isFile()) continue
    if (name === 'get-pip.py') continue
    if (name === 'python310._pth') {
      writeFileSync(join(destDir, name), enableEmbeddedSite(readFileSync(from, 'utf8')), 'utf8')
      continue
    }
    copyFileSync(from, join(destDir, name))
  }
  return { ok: true, pythonExe, getPipPath }
}

export async function ensurePackagedPythonReady(
  sourceDir: string,
  dataRoot: string,
  run: (command: string, args: string[], onLine: (line: string) => void) => Promise<number>,
  onLine: (line: string) => void
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const staged = stagePackagedPython(sourceDir, dataRoot)
  if (!staged.ok) return staged
  onLine('正在准备自带 Python…')
  const hasPip = await run(staged.pythonExe, ['-c', 'import pip'], () => {})
  if (hasPip === 0) return { ok: true }
  if (!existsSync(staged.getPipPath)) {
    return { ok: false, detail: '安装包未带 Python（缺少 get-pip.py）。' }
  }
  onLine('正在为自带 Python 安装 pip…')
  const code = await run(staged.pythonExe, [staged.getPipPath], onLine)
  if (code !== 0) return { ok: false, detail: '无法为自带 Python 安装 pip。' }
  return { ok: true }
}
