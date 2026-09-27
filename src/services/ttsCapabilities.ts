import { fetchTtsHealth } from './voiceForgeApi'

export interface TtsCapabilities {
  configuredEngine: string
  effectiveEngine: string
  voiceForgeSupported: boolean
  /** 本地 Qwen3 权重就绪；为 false 时隐藏音色工坊「本地」页 */
  localQwenModelsReady: boolean
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
        localQwenModelsReady: true,
        hint: null
      }

  const health = await fetchTtsHealth()
  const configuredEngine = health?.configured_engine ?? base.configuredEngine
  const effectiveEngine = health?.backend ?? configuredEngine
  const configMismatch = Boolean(
    health?.backend &&
      health?.configured_engine &&
      health.backend !== health.configured_engine
  )

  // 配置或运行中为 qwen 即可进工坊（无本地权重时仍可进云端页）；第三方引擎走语料预热
  const voiceForgeSupported = configuredEngine === 'qwen' || effectiveEngine === 'qwen'
  const altEngineCorpusSupported = effectiveEngine !== 'qwen' && Boolean(health?.backend)
  const localQwenModelsReady = base.localQwenModelsReady !== false

  let hint: string | null = base.hint ?? null
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
  } else if (!localQwenModelsReady && !hint) {
    hint =
      '未检测到本地 Qwen3 模型权重，音色工坊仅显示云端页。需要本地工坊时请运行 scripts\\win\\install-qwen-models.cmd'
  }

  if (altEngineCorpusSupported) {
    altEngineHint = `当前运行 ${effectiveEngine} 引擎。可在下方编辑语料并用该引擎预热缓存（与 Qwen 音色工坊无关）。`
  }

  cached = {
    configuredEngine,
    effectiveEngine,
    voiceForgeSupported,
    localQwenModelsReady,
    altEngineCorpusSupported,
    configMismatch,
    hint,
    altEngineHint,
    engineStatusLine
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

export async function isLocalQwenModelsReady(force = false): Promise<boolean> {
  const caps = await loadTtsCapabilities(force)
  return caps.localQwenModelsReady
}
