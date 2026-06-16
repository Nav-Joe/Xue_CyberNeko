/**
 * 确保 Live2D Cubism 4 核心运行时存在。
 * pixi-live2d-display/cubism4 依赖 window.Live2DCubismCore，缺失会导致整页白屏。
 */
const fs = require('fs')
const https = require('https')
const path = require('path')

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'live2d', 'live2dcubismcore.min.js')
const DOWNLOAD_URL = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`))
          return
        }
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      })
      .on('error', reject)
  })
}

async function ensureCubismCore(silent = false) {
  if (fs.existsSync(OUTPUT_PATH) && fs.statSync(OUTPUT_PATH).size > 1000) {
    if (!silent) console.log('[cubism-core] 已就绪')
    return
  }

  if (!silent) console.log('[cubism-core] 正在下载 Live2D Cubism Core ...')
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })

  const buffer = await download(DOWNLOAD_URL)
  fs.writeFileSync(OUTPUT_PATH, buffer)
  if (!silent) console.log('[cubism-core] 下载完成')
}

async function main() {
  try {
    await ensureCubismCore()
    console.log('[postinstall] Cubism Core 已就绪')
  } catch (error) {
    console.error('[postinstall] Cubism Core 下载失败:', error.message)
    console.error('请手动执行: npm run setup:model')
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { ensureCubismCore }
