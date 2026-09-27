import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const VALID_ENGINES = new Set(['qwen', 'bert_vits2', 'style_bert_vits2'])

const ENGINE_ALIASES: Record<string, string> = {
  bert: 'bert_vits2',
  'bert-vits2': 'bert_vits2',
  bertvits: 'bert_vits2',
  bert_vits2: 'bert_vits2',
  bertvits2: 'bert_vits2',
  style: 'style_bert_vits2',
  'style-bert-vits2': 'style_bert_vits2',
  style_bert_vits: 'style_bert_vits2',
  stylebertvits2: 'style_bert_vits2',
}

function projectRoot(): string {
  const candidates = [process.cwd(), join(__dirname, '..', '..'), join(__dirname, '..')]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'tts_voice'))) {
      return dir
    }
  }
  return process.cwd()
}

export function normalizeEngineName(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const raw = value.trim().toLowerCase().split('#', 1)[0]?.trim()
  if (!raw) {
    return null
  }
  if (raw in ENGINE_ALIASES) {
    return ENGINE_ALIASES[raw]
  }
  if (VALID_ENGINES.has(raw)) {
    return raw
  }
  return null
}

export function readConfiguredTtsEngine(): string {
  const envEngine = normalizeEngineName(process.env.TTS_ENGINE ?? process.env.TTS_BACKEND)
  if (envEngine) {
    return envEngine
  }

  const configPath = join(projectRoot(), 'tts_voice', 'config.yaml')
  if (!existsSync(configPath)) {
    return 'qwen'
  }

  const text = readFileSync(configPath, 'utf-8')
  const match = text.match(/^engine:\s*(\S+)/m)
  return normalizeEngineName(match?.[1]) ?? 'qwen'
}

export function engineSupportsVoiceForge(engineName: string): boolean {
  return engineName === 'qwen'
}

const QWEN_VD_CONFIG = join(
  'Qwen3_TTS',
  'models',
  'Qwen3-TTS-12Hz-1.7B-VoiceDesign',
  'config.json'
)
const QWEN_BASE_CONFIG = join(
  'Qwen3_TTS',
  'models',
  'Qwen3-TTS-12Hz-0.6B-Base',
  'config.json'
)

/** 本地音色工坊所需权重是否已落盘（与 scripts/win/check-qwen-models.cmd 对齐） */
export function localQwenModelsReady(root: string = projectRoot()): boolean {
  return existsSync(join(root, QWEN_VD_CONFIG)) && existsSync(join(root, QWEN_BASE_CONFIG))
}

export interface TtsEngineCapabilities {
  configuredEngine: string
  voiceForgeSupported: boolean
  /** 本地 Qwen3 VoiceDesign+Base 权重就绪时才展示本地工坊页 */
  localQwenModelsReady: boolean
  hint: string | null
}

export function readTtsEngineCapabilities(): TtsEngineCapabilities {
  const configuredEngine = readConfiguredTtsEngine()
  const modelsReady = localQwenModelsReady()
  return {
    configuredEngine,
    // 工坊入口由渲染层按 configured/effective engine 再判；此处带上本地权重探测结果
    voiceForgeSupported: true,
    localQwenModelsReady: modelsReady,
    hint: modelsReady
      ? null
      : '未检测到本地 Qwen3 模型权重，音色工坊仅显示云端页。需要本地工坊时请运行 scripts\\win\\install-qwen-models.cmd'
  }
}
