const ENROLL_SUFFIX = '/api/v1/services/audio/tts/customization'
const SYNTH_SUFFIX = '/api/v1/services/audio/tts/SpeechSynthesizer'

export const ALI_TTS_URL_DENIED = '地址根必须是 https 的阿里云域名（*.aliyuncs.com）'

export type AliTtsEndpoint = 'synthesize' | 'enroll'

/**
 * 阿里 TTS 的地址只认「根」。
 * 只接受 https 的 aliyuncs.com 及其子域，避免把 API Key 发到别的主机。
 * 合成一律落到 SpeechSynthesizer；复刻一律落到 customization。
 */
export function resolveAliTtsUrl(baseUrl: string, endpoint: AliTtsEndpoint): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return ''
  }
  if (!isAllowedAliHost(url)) return ''

  const path = url.pathname.replace(/\/+$/, '')
  const servicesAt = path.toLowerCase().indexOf('/services/')
  if (servicesAt >= 0) {
    const servicePath = path.slice(servicesAt)
    const root = `${url.origin}${path.slice(0, servicesAt).replace(/\/+$/, '')}`
    if (endpoint === 'enroll') {
      if (/\/audio\/tts\/customization$/i.test(servicePath)) return stripSearch(url)
      return joinApi(root, ENROLL_SUFFIX)
    }
    if (/\/audio\/tts\/speechsynthesizer$/i.test(servicePath)) return stripSearch(url)
    return joinApi(root, SYNTH_SUFFIX)
  }

  const root = `${url.origin}${path}`
  if (/\/api\/v1$/i.test(path)) {
    const relative = endpoint === 'enroll' ? ENROLL_SUFFIX.slice('/api/v1'.length) : SYNTH_SUFFIX.slice('/api/v1'.length)
    return `${root}${relative}`
  }
  return joinApi(root, endpoint === 'enroll' ? ENROLL_SUFFIX : SYNTH_SUFFIX)
}

function isAllowedAliHost(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com')
}

function joinApi(root: string, suffix: string): string {
  const base = root.replace(/\/+$/, '')
  if (/\/api\/v1$/i.test(base)) {
    return `${base}${suffix.slice('/api/v1'.length)}`
  }
  return `${base}${suffix}`
}

function stripSearch(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}
