import { fetchTtsHealth } from './voiceForgeApi'

export interface TtsCapabilities {
  configuredEngine: string
  effectiveEngine: string
  voiceForgeSupported: boolean
  altEngineCorpusSupported: boolean
  configMismatch: boolean
  hint: string | null
  altEngineHint: string | null
  engineStatusLine: string | null
}

let cached: TtsCapabilities | null = null

export async function loadTtsCapabilities(force = false): Promise<TtsCapabilities> {
  if (cached && !force) {
    return cached
  }

  const base = window.electronAPI?.readTtsCapabilities
    ? await window.electronAPI.readTtsCapabilities()
    : {
        configuredEngine: 'qwen',
        voiceForgeSupported: true,
        hint: null,
      }

  const health = await fetchTtsHealth()
  const configuredEngine = health?.configured_engine ?? base.configuredEngine
  const effectiveEngine = health?.backend ?? configuredEngine
  const configMismatch = Boolean(
    health?.backend &&
      health?.configured_engine &&
      health.backend !== health.configured_engine
  )

  // 以 TTS 进程实际后端为准：Qwen 运行时显示音色工坊；非 Qwen 时显示第三方语料
  const voiceForgeSupported = effectiveEngine === 'qwen'
  const altEngineCorpusSupported = effectiveEngine !== 'qwen'

  let hint: string | null = null
  let altEngineHint: string | null = null
  let engineStatusLine: string | null = null

  if (health?.backend) {
    engineStatusLine = `配置: ${configuredEngine} · 运行中: ${effectiveEngine}${
      configMismatch ? '（请关闭 TTS 窗口并重新运行「启动.bat」）' : ''
    }`
  } else {
    engineStatusLine = `配置: ${configuredEngine} · TTS 未连接（请先运行「启动.bat」）`
  }

  if (configMismatch) {
    hint = `config.yaml 已设为 ${configuredEngine}，但 TTS 进程仍在使用 ${health?.backend}。请关闭 TTS 窗口后重新运行「启动.bat」，新引擎才会生效。`
  }

  if (altEngineCorpusSupported) {
    altEngineHint = `当前运行 ${effectiveEngine} 引擎。可在下方编辑语料并用该引擎预热缓存（与 Qwen 音色工坊无关）。`
  }

  cached = {
    configuredEngine,
    effectiveEngine,
    voiceForgeSupported,
    altEngineCorpusSupported,
    configMismatch,
    hint,
    altEngineHint,
    engineStatusLine,
  }
  return cached
}

export function getTtsCapabilities(): TtsCapabilities | null {
  return cached
}

export async function isVoiceForgeSupported(force = false): Promise<boolean> {
  const caps = await loadTtsCapabilities(force)
  return caps.voiceForgeSupported
}

export async function isAltEngineCorpusSupported(force = false): Promise<boolean> {
  const caps = await loadTtsCapabilities(force)
  return caps.altEngineCorpusSupported
}
