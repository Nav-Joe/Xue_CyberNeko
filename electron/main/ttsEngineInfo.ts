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

export interface TtsEngineCapabilities {
  configuredEngine: string
  voiceForgeSupported: boolean
  hint: string | null
}

export function readTtsEngineCapabilities(): TtsEngineCapabilities {
  const configuredEngine = readConfiguredTtsEngine()
  return {
    configuredEngine,
    // 音色工坊是否可用以 TTS /health 的 backend 为准，此处不做禁用判断
    voiceForgeSupported: true,
    hint: null,
  }
}
