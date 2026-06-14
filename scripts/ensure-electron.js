/**
 * 确保 Electron 二进制已正确安装。
 * npm install 若中断，可能出现 dist 不完整、缺少 path.txt，导致 `Electron uninstall` 报错。
 */
const { downloadArtifact } = require('@electron/get')
const extract = require('extract-zip')
const fs = require('fs')
const path = require('path')

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
const distDir = path.join(electronDir, 'dist')
const pathFile = path.join(electronDir, 'path.txt')
const platformPath = process.platform === 'win32' ? 'electron.exe' : 'electron'

function isElectronReady() {
  try {
    const executable = fs.readFileSync(pathFile, 'utf-8').trim()
    return fs.existsSync(path.join(distDir, executable))
  } catch {
    return false
  }
}

async function installElectron() {
  const { version } = require(path.join(electronDir, 'package.json'))

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
  fs.mkdirSync(distDir, { recursive: true })

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
    checksums: require(path.join(electronDir, 'checksums.json'))
  })

  await extract(zipPath, { dir: distDir })
  await fs.promises.writeFile(pathFile, platformPath)
}

async function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === '1') {
    return
  }

  if (!fs.existsSync(electronDir)) {
    return
  }

  if (isElectronReady()) {
    console.log('[postinstall] Electron 已就绪')
    return
  }

  console.log('[postinstall] 正在下载/修复 Electron 二进制，请稍候...')
  try {
    await installElectron()
    console.log('[postinstall] Electron 安装完成')
  } catch (error) {
    console.error('[postinstall] Electron 安装失败:', error.message)
    console.error('请手动执行: npm rebuild electron')
    process.exit(1)
  }
}

main()
