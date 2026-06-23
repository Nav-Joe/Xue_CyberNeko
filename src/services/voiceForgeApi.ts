const TTS_BASE = 'http://127.0.0.1:8000'

export interface TtsHealth {
  status: string
  backend?: string
  configured_engine?: string
  voice_forge_supported?: boolean
  touch_mode: string
  engine: boolean
  ready: boolean
  sync_running: boolean
  prewarm_active?: boolean
  engine_matches_active: boolean
  sample_folder_id?: string
}

export async function fetchTtsHealth(): Promise<TtsHealth | null> {
  try {
    const response = await fetch(`${TTS_BASE}/health`, { cache: 'no-store' })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as TtsHealth
  } catch {
    return null
  }
}

export interface VoiceForgeStatus {
  review_pending: boolean
  phase: string | null
  flow: string | null
  source?: string | null
  displayName: string | null
  folderId: string | null
  reference_ready: boolean
  ready: boolean
}

export async function fetchVoiceForgeStatus(): Promise<VoiceForgeStatus | null> {
  try {
    const response = await fetch(`${TTS_BASE}/voice-forge/status`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as VoiceForgeStatus
  } catch {
    return null
  }
}

export function voiceForgePreviewAudioUrl(): string {
  return `${TTS_BASE}/voice-forge/preview-audio?ts=${Date.now()}`
}

export async function fetchVoiceForgePreviewBlob(): Promise<Blob | null> {
  try {
    const response = await fetch(voiceForgePreviewAudioUrl(), { cache: 'no-store' })
    if (!response.ok) {
      return null
    }
    return await response.blob()
  } catch {
    return null
  }
}

export async function approveVoiceForgeSample(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_BASE}/voice-forge/approve`, { method: 'POST' })
    return response.ok
  } catch {
    return false
  }
}

export async function rejectVoiceForgeSample(action: 'regenerate' | 'skip'): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_BASE}/voice-forge/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    return response.ok
  } catch {
    return false
  }
}

export async function syncTouchModeAfterSwitch(): Promise<{
  ok: boolean
  prewarm?: boolean
  changed?: boolean
  touch_mode?: string
}> {
  try {
    const response = await fetch(`${TTS_BASE}/touch-mode/sync`, { method: 'POST' })
    if (!response.ok) {
      return { ok: false }
    }
    return (await response.json()) as {
      ok: boolean
      prewarm?: boolean
      changed?: boolean
      touch_mode?: string
    }
  } catch {
    return { ok: false }
  }
}

export async function notifyVoiceUploadReady(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetch(`${TTS_BASE}/voice-forge/upload-ready`, { method: 'POST' })
    const data = (await response.json()) as { ok?: boolean; detail?: string }
    if (!response.ok || !data.ok) {
      return { ok: false, detail: data.detail ?? 'TTS 未能进入试听阶段' }
    }
    return { ok: true }
  } catch {
    return { ok: false, detail: '无法连接 TTS 服务，请确认 TTS 窗口正在运行' }
  }
}

export async function resumeVoiceForgeCreation(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetch(`${TTS_BASE}/voice-forge/resume-pending`, { method: 'POST' })
    const data = (await response.json()) as { ok?: boolean; detail?: string }
    if (!response.ok || !data.ok) {
      return { ok: false, detail: data.detail ?? 'TTS 未能开始生成克隆参考音' }
    }
    return { ok: true }
  } catch {
    return { ok: false, detail: '无法连接 TTS 服务，请确认 TTS 窗口正在运行' }
  }
}

export async function waitForVoiceForgeReview(timeoutMs = 300_000): Promise<VoiceForgeStatus | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await fetchVoiceForgeStatus()
    if (status?.review_pending && status.reference_ready) {
      return status
    }
    if (status?.ready && !status.review_pending && status.phase !== 'awaiting_review') {
      return null
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500))
  }
  return null
}
