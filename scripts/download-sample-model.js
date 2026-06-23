/**
 * 下载 Live2D 官方样例「桃濑日和」PRO 版（hiyori_pro）
 * 来源：https://cubism.live2d.com/sample-data/bin/hiyori/（Live2D Inc. 无偿素材）
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const PROJECT_ROOT = path.join(__dirname, '..')
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'public', 'models', 'hiyori_pro')
const TARGET_MODEL_REL = 'runtime/hiyori_pro_t11.model3.json'
const TARGET_MODEL = path.join(OUTPUT_ROOT, TARGET_MODEL_REL)

const ZIP_CANDIDATES = [
  'https://cubism.live2d.com/sample-data/bin/hiyori/hiyori_zh-Hans.zip',
  'https://cubism.live2d.com/sample-data/bin/hiyori/hiyori_ja.zip',
  'https://cubism.live2d.com/sample-data/bin/hiyori/hiyori_en.zip',
]

function downloadBinary(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          fs.unlinkSync(destPath)
          downloadBinary(res.headers.location, destPath).then(resolve).catch(reject)
          return
        }
        if (res.statusCode !== 200) {
          file.close()
          fs.unlink(destPath, () => {})
          reject(new Error(`HTTP ${res.statusCode}: ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      })
      .on('error', (error) => {
        file.close()
        fs.unlink(destPath, () => {})
        reject(error)
      })
  })
}

function walkFiles(dir, prefix = '') {
  const results = []
  if (!fs.existsSync(dir)) {
    return results
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? path.posix.join(prefix, entry.name) : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(abs, rel.replace(/\\/g, '/')))
    } else {
      results.push({ rel: rel.replace(/\\/g, '/'), abs })
    }
  }
  return results
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

function rmDirRecursive(target) {
  if (!fs.existsSync(target)) {
    return
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const abs = path.join(target, entry.name)
    if (entry.isDirectory()) {
      rmDirRecursive(abs)
    } else {
      fs.unlinkSync(abs)
    }
  }
  fs.rmdirSync(target)
}

function findModelFile(rootDir) {
  const files = walkFiles(rootDir)
  return (
    files.find((item) => item.rel.endsWith('hiyori_pro_t11.model3.json')) ||
    files.find((item) => item.rel.endsWith('.model3.json') && item.rel.includes('hiyori'))
  )
}

function resolveHiyoriProSource(extractDir, modelFile) {
  const rel = modelFile.rel.replace(/\\/g, '/')
  const parts = rel.split('/')

  const runtimeIdx = parts.lastIndexOf('runtime')
  if (runtimeIdx >= 0) {
    const modelRootParts = parts.slice(0, runtimeIdx)
    const modelRootRel = modelRootParts.join('/')
    const modelRootAbs = modelRootRel ? path.join(extractDir, ...modelRootParts) : extractDir
    return { modelRootAbs, runtimeRel: 'runtime' }
  }

  const fileDirParts = parts.slice(0, -1)
  const fileDirAbs = fileDirParts.length
    ? path.join(extractDir, ...fileDirParts)
    : extractDir
  return { modelRootAbs: fileDirAbs, runtimeRel: fileDirParts.length ? fileDirParts.join('/') : '.' }
}

function installFromExtractedDir(extractDir) {
  const modelFile = findModelFile(extractDir)
  if (!modelFile) {
    throw new Error('ZIP 内未找到 hiyori_pro 的 .model3.json')
  }

  const { modelRootAbs, runtimeRel } = resolveHiyoriProSource(extractDir, modelFile)
  const runtimeSrc =
    runtimeRel === '.' || runtimeRel === 'runtime'
      ? path.dirname(modelFile.abs)
      : path.join(modelRootAbs, 'runtime')

  if (!fs.existsSync(runtimeSrc)) {
    throw new Error(`未找到 runtime 目录: ${runtimeSrc}`)
  }

  if (fs.existsSync(OUTPUT_ROOT)) {
    rmDirRecursive(OUTPUT_ROOT)
  }
  fs.mkdirSync(path.join(OUTPUT_ROOT, 'runtime'), { recursive: true })
  copyDirRecursive(runtimeSrc, path.join(OUTPUT_ROOT, 'runtime'))

  if (!fs.existsSync(TARGET_MODEL)) {
    throw new Error(`安装后仍未找到目标模型: ${TARGET_MODEL_REL}`)
  }
}

function extractZip(zipPath, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true })
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`
    execSync(cmd, { stdio: 'inherit' })
    return
  }
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' })
}

async function downloadAndInstall() {
  const tmpRoot = path.join(PROJECT_ROOT, '.runtime', 'live2d-download')
  fs.mkdirSync(tmpRoot, { recursive: true })

  let lastError = null
  for (const url of ZIP_CANDIDATES) {
    const zipPath = path.join(tmpRoot, path.basename(url.split('?')[0]))
    const extractDir = path.join(tmpRoot, `extract-${path.basename(zipPath, '.zip')}`)
    try {
      console.log(`[setup:model] 正在下载 ${url} ...`)
      await downloadBinary(url, zipPath)
      if (fs.existsSync(extractDir)) {
        rmDirRecursive(extractDir)
      }
      extractZip(zipPath, extractDir)
      installFromExtractedDir(extractDir)
      console.log(`[setup:model] 完成 -> public/models/hiyori_pro/${TARGET_MODEL_REL}`)
      return
    } catch (error) {
      lastError = error
      console.warn(`[setup:model] ${url} 失败: ${error.message}`)
    }
  }

  throw lastError || new Error('所有下载源均失败')
}

async function main() {
  if (fs.existsSync(TARGET_MODEL)) {
    console.log('[setup:model] hiyori_pro 已存在，跳过下载')
  } else {
    console.log('[setup:model] 正在下载 Live2D 官方样例「桃濑日和」PRO (hiyori_pro) ...')
    await downloadAndInstall()
  }

  const { ensureCubismCore } = require('./ensure-cubism-core')
  await ensureCubismCore()
}

main().catch((error) => {
  console.error('[setup:model] 下载失败:', error.message)
  console.error('也可从 https://www.live2d.com/learn/sample/momose-hiyori/ 手动下载 ZIP，')
  console.error('解压后将含 runtime 的 hiyori_pro 文件夹放入 public/models/hiyori_pro/')
  process.exit(1)
})
