/**
 * 下载 Live2D 官方免费示例模型 Haru（Cubism 4）
 * 来源：https://github.com/Live2D/CubismWebSamples
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const BASE_URL =
  'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@develop/Samples/Resources/Haru/'
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'models', 'Haru')

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`))
          return
        }
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      })
      .on('error', reject)
  })
}

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBinary(res.headers.location).then(resolve).catch(reject)
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

function collectFiles(modelJson, prefix = '') {
  const files = new Set()
  const refs = modelJson.FileReferences

  if (refs.Moc) files.add(path.posix.join(prefix, refs.Moc))
  if (refs.Physics) files.add(path.posix.join(prefix, refs.Physics))
  if (refs.Pose) files.add(path.posix.join(prefix, refs.Pose))
  if (refs.DisplayInfo) files.add(path.posix.join(prefix, refs.DisplayInfo))
  if (refs.UserData) files.add(path.posix.join(prefix, refs.UserData))

  for (const texture of refs.Textures ?? []) {
    files.add(path.posix.join(prefix, texture))
  }

  for (const expression of refs.Expressions ?? []) {
    files.add(path.posix.join(prefix, expression.File))
  }

  for (const motions of Object.values(refs.Motions ?? {})) {
    for (const motion of motions) {
      files.add(path.posix.join(prefix, motion.File))
      if (motion.Sound) {
        files.add(path.posix.join(prefix, motion.Sound))
      }
    }
  }

  return [...files]
}

async function downloadFile(relativePath) {
  const url = BASE_URL + relativePath.replace(/\\/g, '/')
  const outputPath = path.join(OUTPUT_DIR, relativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  if (relativePath.endsWith('.json')) {
    const text = await fetchText(url)
    fs.writeFileSync(outputPath, text)
  } else {
    const buffer = await fetchBinary(url)
    fs.writeFileSync(outputPath, buffer)
  }

  console.log(`  ✓ ${relativePath}`)
}

async function main() {
  console.log('[setup:model] 正在下载 Live2D 官方示例 Haru ...')
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const settingsText = await fetchText(BASE_URL + 'Haru.model3.json')
  const settings = JSON.parse(settingsText)
  const files = collectFiles(settings)

  await downloadFile('Haru.model3.json')

  for (const file of files) {
    await downloadFile(file)
  }

  console.log(`[setup:model] 完成，共 ${files.length + 1} 个文件 -> public/models/Haru/`)
}

main().catch((error) => {
  console.error('[setup:model] 下载失败:', error.message)
  process.exit(1)
})
