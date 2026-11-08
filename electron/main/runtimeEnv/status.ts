import { existsSync, readdirSync } from 'fs'
import { dirname, join, relative } from 'path'
import { spawnSync } from 'child_process'

import { LIVE2D_SAMPLE_LICENSE } from './live2dLicense'
import { formatInstalledBytes, sizeTargetsFor, sumInstalledBytes } from './size'
import type { RuntimeComponentId, RuntimeComponentStatus } from './types'

const HIYORI_DIR = join('public', 'models', 'hiyori_pro')
const STT_MODEL_DIRS = [
  join('.runtime', 'stt-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'),
  join('.runtime', 'stt-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17')
]
const QWEN_CONFIGS = [
  join('Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'config.json'),
  join('Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-0.6B-Base', 'config.json')
]

function walkModel3(dir: string, skipDirName: string | null, out: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirName && entry.isDirectory() && entry.name === skipDirName) continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkModel3(abs, null, out)
    } else if (entry.isFile() && entry.name.endsWith('.model3.json')) {
      out.push(abs)
    }
  }
}

export function live2dModelFiles(root: string): { official: boolean; others: string[] } {
  const modelsDir = join(root, 'public', 'models')
  const official = existsSync(join(root, HIYORI_DIR, 'runtime', 'hiyori_pro_t11.model3.json'))
  const others: string[] = []
  walkModel3(modelsDir, 'hiyori_pro', others)
  return { official, others }
}

function sttWeightsReady(root: string): boolean {
  return STT_MODEL_DIRS.some((rel) => {
    const dir = join(root, rel)
    if (!existsSync(join(dir, 'tokens.txt'))) return false
    return existsSync(join(dir, 'model.int8.onnx')) || existsSync(join(dir, 'model.onnx'))
  })
}

function qwenWeightsReady(root: string): boolean {
  return QWEN_CONFIGS.every((rel) => existsSync(join(root, rel)))
}

function llamaReady(root: string): boolean {
  const exe =
    existsSync(join(root, 'llama-server.exe')) || existsSync(join(root, 'llama_bin', 'llama-server.exe'))
  const model = existsSync(join(root, 'llama_models', 'qwen2.5-3b-instruct-q4_k_m.gguf'))
  return exe && model
}

function bertReady(root: string): boolean {
  return existsSync(join(root, 'Bert-VITS2', 'config.yml'))
}

function componentSizeLabel(root: string, id: RuntimeComponentId, extraModelDirs: string[]): string | null {
  const bytes = sumInstalledBytes(root, sizeTargetsFor(root, id, extraModelDirs))
  if (bytes == null || bytes <= 0) return null
  return formatInstalledBytes(bytes)
}

/** 与安装包拉起语音前的检查用同一句，避免两边对「装好了」的判断漂移。 */
export const TTS_SIDECAR_IMPORT = 'import soundfile, fastapi, uvicorn, qwen_tts, torch'

function pythonImports(root: string, statement: string): boolean {
  const py = join(root, '.venv', 'Scripts', 'python.exe')
  if (!existsSync(py)) return false
  const result = spawnSync(py, ['-c', statement], {
    cwd: root,
    windowsHide: true,
    timeout: 20000
  })
  return result.status === 0
}

export function readRuntimeEnvStatus(root: string): RuntimeComponentStatus[] {
  const live2d = live2dModelFiles(root)
  const live2dInstalled = live2d.official || live2d.others.length > 0
  const live2dCanUninstall = live2d.official && live2d.others.length > 0
  const ttsInstalled = pythonImports(root, TTS_SIDECAR_IMPORT)
  const sttInstalled = sttWeightsReady(root)
  const qwenInstalled = qwenWeightsReady(root)
  const llamaInstalled = llamaReady(root)
  const bertInstalled = bertReady(root)
  const live2dDirs = [...new Set(live2d.others.map((file) => relative(root, dirname(file))))]
  const sizeOf = (id: RuntimeComponentId): string | null => componentSizeLabel(root, id, live2dDirs)

  return [
    {
      id: 'live2d-model',
      title: 'Live2D 模型',
      summary: live2d.official
        ? '目前默认为公开模型「桃濑日和」，缺少时会直接丢失模型，官方私模搁置中...'
        : live2dInstalled
          ? '已检测到自备模型，视为这项已满足。这里不会删除你自己的模型。'
          : '必装。可下载官方样板，或自行放入 .model3.json 后再打开本页。',
      required: true,
      installed: live2dInstalled,
      canInstall: !live2dInstalled,
      canUninstall: live2dCanUninstall,
      uninstallBlockedReason: !live2d.official
        ? null
        : live2dCanUninstall
          ? null
          : '这是当前唯一的模型，卸掉后桌宠无法显示。',
      sizeLabel: sizeOf('live2d-model'),
      license: LIVE2D_SAMPLE_LICENSE
    },
    {
      id: 'tts-sidecar',
      title: '本地语音合成',
      summary: '本地语音推理必要环境，因卸载容易搞坏故安装完不提供卸载',
      required: false,
      installed: ttsInstalled,
      canInstall: !ttsInstalled,
      canUninstall: false,
      uninstallBlockedReason: null,
      sizeLabel: sizeOf('tts-sidecar'),
      license: null
    },
    {
      id: 'stt-sensevoice',
      title: '听写模型',
      summary: '聊天语音输入用的 SenseVoice 权重。卸载只删除模型文件。',
      required: false,
      installed: sttInstalled,
      canInstall: !sttInstalled,
      canUninstall: sttInstalled,
      uninstallBlockedReason: null,
      sizeLabel: sizeOf('stt-sensevoice'),
      license: null
    },
    {
      id: 'qwen-weights',
      title: '本地 Qwen 语音权重',
      summary: '音色工坊本地创造 / 克隆用。只用云端音色时可以不装。卸载只删这两套权重。',
      required: false,
      installed: qwenInstalled,
      canInstall: !qwenInstalled,
      canUninstall: qwenInstalled,
      uninstallBlockedReason: null,
      sizeLabel: sizeOf('qwen-weights'),
      license: null
    },
    {
      id: 'llama-local',
      title: '本地聊天模型',
      summary: 'llama-server 与默认 Qwen2.5 3B。卸载只删除本应用下载的程序和这份默认模型，不删你另外放进去的 gguf。',
      required: false,
      installed: llamaInstalled,
      canInstall: !llamaInstalled,
      canUninstall: llamaInstalled,
      uninstallBlockedReason: null,
      sizeLabel: sizeOf('llama-local'),
      license: null
    },
    {
      id: 'alt-engine-bert',
      title: '第三方语音引擎',
      summary: 'Bert-VITS2 推理仓库。卸载不自动删整个克隆目录，避免误删你改过的文件。',
      required: false,
      installed: bertInstalled,
      canInstall: !bertInstalled,
      canUninstall: false,
      uninstallBlockedReason: '请手动删除 Bert-VITS2 目录。这里不拆虚拟环境，也不整包删除仓库。',
      sizeLabel: sizeOf('alt-engine-bert'),
      license: null
    }
  ]
}
