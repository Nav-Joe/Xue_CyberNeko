import { existsSync, statSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { pathToFileURL } from 'url'

import { dataRoot } from '../config/roots'
import { logWarn } from '../logging/logger'

/** 标准安全协议，页面源是 xue://local，现有 CSP 的 'self' 能罩住脚本和音频。 */
export const RENDERER_SCHEME = 'xue'
export const RENDERER_HOST = 'local'

export type RendererFileRoots = {
  rendererRoot: string
  modelsRoot: string
}

let protocolRegistered = false

export function rendererPageUrl(hash = ''): string {
  const base = `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`
  if (!hash) return base
  const clean = hash.startsWith('#') ? hash.slice(1) : hash
  return clean ? `${base}#${clean}` : base
}

/** 有 Vite 地址就走开发服务器，否则走 xue://local。环境窗靠 hash 区分。 */
export function selectRendererUrl(devServerUrl: string | undefined, hash = ''): string {
  if (devServerUrl) {
    return hash ? `${devServerUrl}#${hash}` : devServerUrl
  }
  return rendererPageUrl(hash)
}

/**
 * 把 xue://local 的路径落到磁盘。
 * /models 指到数据根，模型 json 里的贴图是相对这个地址请求的。
 * 其余文件指到构建出的页面目录。含 .. 或盘符的路径直接拒绝。
 */
export function resolveRendererFile(requestUrl: string, roots: RendererFileRoots): string | null {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== `${RENDERER_SCHEME}:` || parsed.hostname !== RENDERER_HOST) return null

  const parts = pathParts(requestUrl)
  if (!parts) return null
  if (parts.length === 0) return inside(roots.rendererRoot, ['index.html'])
  if (parts[0] === 'models') {
    const rest = parts.slice(1)
    if (rest.length === 0) return null
    return inside(roots.modelsRoot, rest)
  }
  return inside(roots.rendererRoot, parts)
}

/** 必须在 app ready 之前调用，否则页面源不会被当成安全来源。 */
export function registerRendererScheme(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { protocol } = require('electron') as typeof import('electron')
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RENDERER_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/** ready 之后挂上。主进程打进 out/main 时，页面在旁边的 out/renderer。 */
export function registerRendererProtocol(): void {
  if (protocolRegistered) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { net, protocol } = require('electron') as typeof import('electron')
  const rendererRoot = join(__dirname, '../renderer')
  protocol.handle(RENDERER_SCHEME, async (request) => {
    try {
      const abs = resolveRendererFile(request.url, {
        rendererRoot,
        modelsRoot: join(dataRoot(), 'public', 'models')
      })
      if (!abs || !isFile(abs)) return notFound()
      return await net.fetch(pathToFileURL(abs).toString())
    } catch (error) {
      logWarn('main', 'renderer file read failed', error)
      return notFound()
    }
  })
  protocolRegistered = true
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

function isFile(abs: string): boolean {
  if (!existsSync(abs)) return false
  try {
    return statSync(abs).isFile()
  } catch {
    return false
  }
}

function pathParts(requestUrl: string): string[] | null {
  const raw = rawPathname(requestUrl)
  if (raw == null) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const parts = decoded.split(/[/\\]+/).filter((part) => part.length > 0 && part !== '.')
  if (parts.some((part) => part === '..' || part.includes(':') || part.includes('\0'))) return null
  return parts
}

/** 用原始路径判断 ..，避免 URL 解析先把 %2e%2e 折成上一级。 */
function rawPathname(requestUrl: string): string | null {
  const beforeHash = requestUrl.split('#')[0] ?? ''
  const beforeQuery = beforeHash.split('?')[0] ?? ''
  const schemeIdx = beforeQuery.indexOf('://')
  if (schemeIdx < 0) return null
  const afterScheme = beforeQuery.slice(schemeIdx + 3)
  const slash = afterScheme.indexOf('/')
  if (slash < 0) return '/'
  return afterScheme.slice(slash)
}

function inside(root: string, parts: string[]): string | null {
  const abs = resolve(root, ...parts)
  const rel = relative(resolve(root), abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return abs
}
