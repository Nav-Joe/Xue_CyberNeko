import { existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

/** 环境页和语音进程真正会读到的文件。缺一个就不要打安装包。 */
export const REQUIRED_APP_ROOT_FILES = [
  'tts_voice/tts_server.py',
  'tts_voice/requirements.txt',
  'tts_voice/requirements-bert-vits2-infer.txt',
  'tts_voice/qwen_config.json',
  'tts_voice/config.yaml',
  'stt_service/__main__.py',
  'src/data/corpus.json',
  'voice_forge/default_sample/reference.wav',
  'voice_forge/default_sample/reference.txt',
  'voice_forge/default_sample/meta.json',
  'scripts/download-sample-model.js',
  'scripts/ensure-cubism-core.js',
  'scripts/setup-bert-vits2.cmd',
  'scripts/win/install-tts-deps.cmd',
  'scripts/win/install-stt-deps.cmd',
  'scripts/win/install-stt-models.cmd',
  'scripts/win/install-qwen-models.cmd',
  'scripts/qwen3-tts/download-model.cmd'
]

const WALK_ROOTS = ['tts_voice', 'stt_service', 'scripts', 'src/data', 'voice_forge/default_sample']

/**
 * 只读根白名单。本机的权重、模型和虚拟环境即使躺在仓库里也不进安装包。
 * 路径使用正斜杠。
 */
export function shouldShipAppRootFile(relPosix) {
  const rel = relPosix.replace(/\\/g, '/')
  if (rel.endsWith('.pyc') || rel.includes('/__pycache__/')) return false
  if (rel.startsWith('tts_voice/')) {
    if (rel.startsWith('tts_voice/tests/')) return false
    if (rel.startsWith('tts_voice/bert/')) return false
    if (rel.endsWith('.pth')) return false
    if (rel === 'tts_voice/config.json') return false
    return true
  }
  if (rel.startsWith('stt_service/')) {
    if (rel.startsWith('stt_service/tests/')) return false
    if (rel.startsWith('stt_service/.cache/')) return false
    return true
  }
  if (rel.startsWith('scripts/win/tests/')) return false
  if (rel.startsWith('scripts/poc-')) return false
  if (rel.startsWith('scripts/verify-screen-companion')) return false
  if (rel.startsWith('scripts/check-file-budgets')) return false
  if (rel.startsWith('scripts/file-budget-allowlist')) return false
  if (rel.startsWith('scripts/check-comment-internal-tags')) return false
  if (rel.startsWith('scripts/win/')) return true
  if (rel.startsWith('scripts/qwen3-tts/')) return true
  if (rel === 'scripts/download-sample-model.js') return true
  if (rel === 'scripts/ensure-cubism-core.js') return true
  if (rel === 'scripts/setup-bert-vits2.cmd') return true
  if (rel === 'src/data/corpus.json') return true
  if (rel === 'voice_forge/default_sample/reference.wav') return true
  if (rel === 'voice_forge/default_sample/reference.txt') return true
  if (rel === 'voice_forge/default_sample/meta.json') return true
  return false
}

export function missingAppRootFiles(rels) {
  const have = new Set(rels)
  return REQUIRED_APP_ROOT_FILES.filter((rel) => !have.has(rel))
}

function walkFiles(repoRoot, absDir, out) {
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name)
    const rel = relative(repoRoot, abs).replace(/\\/g, '/')
    if (statSync(abs).isDirectory()) {
      walkFiles(repoRoot, abs, out)
      continue
    }
    if (shouldShipAppRootFile(rel)) out.push(rel)
  }
}

/** 只扫会进只读根的那几棵目录，避免扫到 .venv 和模型权重。 */
export function listAppRootRelPaths(repoRoot) {
  const out = []
  for (const rel of WALK_ROOTS) {
    const abs = join(repoRoot, rel)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) walkFiles(repoRoot, abs, out)
    else if (shouldShipAppRootFile(rel)) out.push(rel)
  }
  return out.sort()
}
