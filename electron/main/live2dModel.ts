import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const DEFAULT_MODEL_REL = 'hiyori_pro/runtime/hiyori_pro_t11.model3.json'

const PREFERRED_REL_PATHS = [DEFAULT_MODEL_REL, 'Hiyori/Hiyori.model3.json']

function projectRoot(): string {
  const candidates = [process.cwd(), join(__dirname, '..', '..'), join(__dirname, '..')]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'voice_forge'))) {
      return dir
    }
  }
  return process.cwd()
}

function modelsDir(): string {
  return join(projectRoot(), 'public', 'models')
}

function toWebPath(relativePath: string): string {
  return `/models/${relativePath.replace(/\\/g, '/')}`
}

function walkForModel3Json(dir: string, prefix = ''): string | null {
  if (!existsSync(dir)) {
    return null
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = walkForModel3Json(abs, rel)
      if (nested) {
        return nested
      }
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.model3.json')) {
      return rel
    }
  }
  return null
}

export function findLive2DModelRelPath(): string | null {
  const root = modelsDir()
  for (const rel of PREFERRED_REL_PATHS) {
    const abs = join(root, rel)
    if (existsSync(abs) && statSync(abs).isFile()) {
      return rel
    }
  }
  return walkForModel3Json(root)
}

export function resolveLive2DModelWebPath(): string | null {
  const rel = findLive2DModelRelPath()
  return rel ? toWebPath(rel) : null
}

export const DEFAULT_LIVE2D_MODEL_WEB_PATH = toWebPath(DEFAULT_MODEL_REL)
