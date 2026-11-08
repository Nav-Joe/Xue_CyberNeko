import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

import type { RuntimeComponentId } from './types'

/** 路径相对调用方传入的数据根。未打包时数据根就是仓库根。 */
export type ComponentSizeTarget = {
  path: string
}

export function formatInstalledBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb >= 1) {
    const digits = gb >= 10 ? 0 : 1
    return `${gb.toFixed(digits)} GB`
  }
  const mb = bytes / 1024 ** 2
  if (mb >= 1) {
    const digits = mb >= 10 ? 0 : 1
    return `${mb.toFixed(digits)} MB`
  }
  const kb = Math.max(1, Math.round(bytes / 1024))
  return `${kb} KB`
}

export function measureTreeBytes(absPath: string): number {
  if (!existsSync(absPath)) return 0
  const stat = statSync(absPath)
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0
  let total = 0
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    total += measureTreeBytes(join(absPath, entry.name))
  }
  return total
}

/** 路径都不存在时返回 null，界面就不画大小。 */
export function sumInstalledBytes(root: string, targets: ComponentSizeTarget[]): number | null {
  let total = 0
  let found = false
  for (const target of targets) {
    const abs = join(root, target.path)
    if (!existsSync(abs)) continue
    found = true
    total += measureTreeBytes(abs)
  }
  return found ? total : null
}

function sitePackageTargets(root: string, prefixes: string[]): ComponentSizeTarget[] {
  const relRoot = join('.venv', 'Lib', 'site-packages')
  const absRoot = join(root, relRoot)
  if (!existsSync(absRoot)) return []
  const names = readdirSync(absRoot).filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
  return names.map((name) => ({ path: join(relRoot, name) }))
}

export function sizeTargetsFor(root: string, id: RuntimeComponentId, extraModelDirs: string[]): ComponentSizeTarget[] {
  if (id === 'live2d-model') {
    const targets: ComponentSizeTarget[] = [{ path: join('public', 'models', 'hiyori_pro') }]
    for (const dir of extraModelDirs) targets.push({ path: dir })
    return targets
  }
  if (id === 'tts-sidecar') {
    return sitePackageTargets(root, ['torch', 'torchaudio', 'torchvision', 'qwen_tts', 'nvidia'])
  }
  if (id === 'stt-sensevoice') return [{ path: join('.runtime', 'stt-models') }]
  if (id === 'qwen-weights') {
    return [
      { path: join('Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign') },
      { path: join('Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-0.6B-Base') }
    ]
  }
  if (id === 'llama-local') {
    return [
      { path: 'llama_bin' },
      { path: 'llama-server.exe' },
      { path: join('llama_models', 'qwen2.5-3b-instruct-q4_k_m.gguf') }
    ]
  }
  return [{ path: 'Bert-VITS2' }]
}
