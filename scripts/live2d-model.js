/**
 * 检测 public/models 下的 Live2D 模型；默认路径为官方 PRO 样例「桃濑日和」(hiyori_pro)。
 */
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models')

/** 默认目标（Live2D 官方 hiyori_pro 样例） */
const DEFAULT_MODEL_REL = 'hiyori_pro/runtime/hiyori_pro_t11.model3.json'

const PREFERRED_REL_PATHS = [DEFAULT_MODEL_REL, 'Hiyori/Hiyori.model3.json']

function toWebPath(relativePath) {
  return `/models/${relativePath.replace(/\\/g, '/')}`
}

function walkForModel3Json(dir, prefix = '') {
  if (!fs.existsSync(dir)) {
    return null
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const rel = prefix ? path.posix.join(prefix, entry.name) : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = walkForModel3Json(abs, rel.replace(/\\/g, '/'))
      if (nested) {
        return nested
      }
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.model3.json')) {
      return rel.replace(/\\/g, '/')
    }
  }
  return null
}

function findModelRelPath() {
  for (const rel of PREFERRED_REL_PATHS) {
    const abs = path.join(MODELS_DIR, rel)
    if (fs.existsSync(abs)) {
      return rel.replace(/\\/g, '/')
    }
  }
  return walkForModel3Json(MODELS_DIR)
}

function hasLive2DModel() {
  return Boolean(findModelRelPath())
}

function resolveLive2DModelWebPath() {
  const rel = findModelRelPath()
  return rel ? toWebPath(rel) : null
}

module.exports = {
  DEFAULT_MODEL_REL,
  DEFAULT_MODEL_WEB_PATH: toWebPath(DEFAULT_MODEL_REL),
  findModelRelPath,
  hasLive2DModel,
  resolveLive2DModelWebPath,
  toWebPath,
}

if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.includes('--check')) {
    process.exit(hasLive2DModel() ? 0 : 1)
  }

  if (args.includes('--web-path')) {
    const webPath = resolveLive2DModelWebPath()
    if (!webPath) {
      process.exit(1)
    }
    console.log(webPath)
    process.exit(0)
  }

  if (args.includes('--rel-path')) {
    const rel = findModelRelPath()
    if (!rel) {
      process.exit(1)
    }
    console.log(rel)
    process.exit(0)
  }

  console.log(hasLive2DModel() ? resolveLive2DModelWebPath() : 'missing')
}
