/**
 * 把宣传站需要的 Live2D 演示资源拷进 site/，给本地预览和 GitHub Pages 用。
 * - site/models/hiyori_pro：官方样板（约 30MB，不入库）
 * - site/live2d：Cubism Core
 * - site/vendor：Pixi 与 cubism4 包装
 *
 * 用法：node scripts/stage-site-assets.mjs
 * 没有日和时会先跑 scripts/download-sample-model.js。
 */
import { createWriteStream, copyFileSync, cpSync, existsSync, mkdirSync, statSync } from 'fs'
import { get as httpsGet } from 'https'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = join(repoRoot, 'site')

const MODEL_MARKER = join('models', 'hiyori_pro', 'runtime', 'hiyori_pro_t11.model3.json')
const SOURCE_MODEL = join(repoRoot, 'public', 'models', 'hiyori_pro')
const DEST_MODEL = join(siteRoot, 'models', 'hiyori_pro')

const VENDORS = [
  {
    dest: join(siteRoot, 'vendor', 'pixi.min.js'),
    local: join(repoRoot, 'node_modules', 'pixi.js', 'dist', 'browser', 'pixi.min.js'),
    url: 'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js'
  },
  {
    dest: join(siteRoot, 'vendor', 'live2d-cubism4.min.js'),
    local: join(repoRoot, 'node_modules', 'pixi-live2d-display', 'dist', 'cubism4.min.js'),
    url: 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js'
  }
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const go = (current) => {
      httpsGet(current, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          go(new URL(res.headers.location, current).href)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status}: ${url}`))
          return
        }
        mkdirSync(dirname(dest), { recursive: true })
        pipeline(res, createWriteStream(dest)).then(resolve, reject)
      }).on('error', reject)
    }
    go(url)
  })
}

function runNode(scriptRel) {
  const result = spawnSync(process.execPath, [join(repoRoot, scriptRel)], {
    cwd: repoRoot,
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    throw new Error(`${scriptRel} 失败（exit ${result.status ?? 1}）`)
  }
}

async function ensureModel() {
  if (existsSync(join(DEST_MODEL, 'runtime', 'hiyori_pro_t11.model3.json'))) {
    console.log('[stage-site] models/hiyori_pro 已在 site/')
    return
  }
  if (!existsSync(join(SOURCE_MODEL, 'runtime', 'hiyori_pro_t11.model3.json'))) {
    console.log('[stage-site] 本机还没有日和，先下载到 public/models …')
    runNode('scripts/download-sample-model.js')
  }
  mkdirSync(join(siteRoot, 'models'), { recursive: true })
  cpSync(SOURCE_MODEL, DEST_MODEL, { recursive: true })
  console.log(`[stage-site] 已拷贝 ${MODEL_MARKER}`)
}

async function ensureCubism() {
  const dest = join(siteRoot, 'live2d', 'live2dcubismcore.min.js')
  const source = join(repoRoot, 'public', 'live2d', 'live2dcubismcore.min.js')
  if (existsSync(dest) && statSync(dest).size > 1000) {
    console.log('[stage-site] live2d/live2dcubismcore.min.js 已在 site/')
    return
  }
  if (!existsSync(source) || statSync(source).size < 1000) {
    runNode('scripts/ensure-cubism-core.js')
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(source, dest)
  console.log('[stage-site] 已拷贝 live2d/live2dcubismcore.min.js')
}

async function ensureVendors() {
  for (const item of VENDORS) {
    if (existsSync(item.dest)) {
      console.log(`[stage-site] 已有 ${item.dest.slice(siteRoot.length + 1)}`)
      continue
    }
    mkdirSync(dirname(item.dest), { recursive: true })
    if (existsSync(item.local)) {
      copyFileSync(item.local, item.dest)
      console.log(`[stage-site] 已拷贝 ${item.dest.slice(siteRoot.length + 1)}`)
      continue
    }
    console.log(`[stage-site] 下载 ${item.url}`)
    await download(item.url, item.dest)
  }
}

await ensureModel()
await ensureCubism()
await ensureVendors()
console.log('[stage-site] 完成。本地可用 node site/serve.mjs；Pages 工作流也会跑本脚本。')
