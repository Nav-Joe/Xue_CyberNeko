/**
 * 宣传站本地预览。
 * 优先读 site/ 里由 scripts/stage-site-assets.mjs 生成的 models、live2d、vendor；
 * 没有时再回退到仓库 public/ 与 node_modules。
 * 用法：node scripts/stage-site-assets.mjs && node site/serve.mjs
 * 打开 http://127.0.0.1:4173/
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SITE = __dirname
const PORT = Number(process.env.SITE_PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.moc3': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
}

function resolveUrl(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  if (clean === '/vendor/pixi.min.js') {
    const staged = path.join(SITE, 'vendor', 'pixi.min.js')
    if (fs.existsSync(staged)) return staged
    return path.join(ROOT, 'node_modules/pixi.js/dist/browser/pixi.min.js')
  }
  if (clean === '/vendor/live2d-cubism4.min.js') {
    const staged = path.join(SITE, 'vendor', 'live2d-cubism4.min.js')
    if (fs.existsSync(staged)) return staged
    return path.join(ROOT, 'node_modules/pixi-live2d-display/dist/cubism4.min.js')
  }
  if (clean.startsWith('/models/')) {
    const staged = path.join(SITE, clean.slice(1))
    if (fs.existsSync(staged)) return staged
    return path.join(ROOT, 'public', clean.slice(1))
  }
  if (clean.startsWith('/live2d/')) {
    const staged = path.join(SITE, clean.slice(1))
    if (fs.existsSync(staged)) return staged
    return path.join(ROOT, 'public', clean.slice(1))
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\//, '')
  return path.join(SITE, rel)
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const filePath = resolveUrl(req.url || '/')
  const rootSafe =
    filePath.startsWith(SITE) ||
    filePath.startsWith(path.join(ROOT, 'public')) ||
    filePath.startsWith(path.join(ROOT, 'node_modules'))
  if (!rootSafe) {
    send(res, 403, 'Forbidden')
    return
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, `Not found: ${req.url}`)
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    send(res, 200, data, MIME[ext] || 'application/octet-stream')
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[site] http://127.0.0.1:${PORT}/`)
  console.log('[site] Live2D demo needs this server (not file://)')
})
