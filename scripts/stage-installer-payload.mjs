/**
 * 打包前准备两份暂存：
 * - staging/app-root：只读根白名单
 * - staging/python：官方嵌入版 Python 3.10.10 加上 get-pip.py
 * 这两份不进仓库。嵌入版已在且文件齐全时不重复下载。
 */
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { request as httpsRequest } from 'https'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { listAppRootRelPaths, missingAppRootFiles } from './installer/payloadPlan.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const stagingRoot = join(repoRoot, 'staging')
const appRootDest = join(stagingRoot, 'app-root')
const pythonDest = join(stagingRoot, 'python')

const PYTHON_URLS = [
  'https://www.python.org/ftp/python/3.10.10/python-3.10.10-embed-amd64.zip',
  'https://registry.npmmirror.com/-/binary/python/3.10.10/python-3.10.10-embed-amd64.zip'
]
const GET_PIP_URLS = [
  'https://bootstrap.pypa.io/get-pip.py',
  'https://mirrors.aliyun.com/pypi/get-pip.py'
]
const PYTHON_ZIP_SHA256 = 'b8c99a1bce379287eae580e7ecd0d8f4afdce0a27268d7f26db205f3362d7bab'
const PYTHON_FILES = ['python.exe', 'python310.zip', 'python310._pth', 'get-pip.py']

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    let timer
    const req = httpsRequest(url, (res) => {
      clearTimeout(timer)
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).href
        downloadTo(next, dest).then(resolve, reject)
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`下载失败 ${status}: ${url}`))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const bytes = Buffer.concat(chunks)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, bytes)
        resolve(bytes)
      })
    })
    timer = setTimeout(() => req.destroy(new Error(`下载超时: ${url}`)), 20_000)
    req.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    req.end()
  })
}

async function downloadFirst(urls, dest) {
  let lastError = null
  for (const url of urls) {
    try {
      console.log(`[stage] GET ${url}`)
      return await downloadTo(url, dest)
    } catch (error) {
      lastError = error
      console.log(`[stage] ${error instanceof Error ? error.message : error}`)
    }
  }
  throw lastError ?? new Error('下载失败')
}

function pythonReady() {
  return PYTHON_FILES.every((name) => existsSync(join(pythonDest, name)))
}

function stageAppRoot() {
  rmSync(appRootDest, { recursive: true, force: true })
  mkdirSync(appRootDest, { recursive: true })
  const rels = listAppRootRelPaths(repoRoot)
  const missing = missingAppRootFiles(rels)
  if (missing.length > 0) {
    throw new Error(`只读根缺少文件：${missing.join('、')}`)
  }
  for (const rel of rels) {
    const dest = join(appRootDest, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(repoRoot, rel), dest)
  }
  console.log(`[stage] app-root ${rels.length} files`)
}

async function stagePython() {
  if (pythonReady()) {
    console.log('[stage] python payload already present')
    return
  }
  mkdirSync(pythonDest, { recursive: true })
  const embedReady = ['python.exe', 'python310.zip', 'python310._pth'].every((name) =>
    existsSync(join(pythonDest, name))
  )
  if (!embedReady) {
    const zipPath = join(stagingRoot, 'python-3.10.10-embed-amd64.zip')
    let zipBytes = existsSync(zipPath) ? readFileSync(zipPath) : null
    let sha256 = zipBytes ? createHash('sha256').update(zipBytes).digest('hex') : ''
    if (sha256 !== PYTHON_ZIP_SHA256) {
      console.log('[stage] downloading embeddable Python 3.10.10')
      zipBytes = await downloadFirst(PYTHON_URLS, zipPath)
      sha256 = createHash('sha256').update(zipBytes).digest('hex')
    }
    if (sha256 !== PYTHON_ZIP_SHA256) {
      throw new Error(`嵌入版 Python 校验不一致: ${sha256}`)
    }
    execFileSync('tar', ['-xf', zipPath, '-C', pythonDest], { stdio: 'inherit' })
  }
  if (!existsSync(join(pythonDest, 'get-pip.py'))) {
    console.log('[stage] downloading get-pip.py')
    await downloadFirst(GET_PIP_URLS, join(pythonDest, 'get-pip.py'))
  }
  if (!pythonReady()) {
    throw new Error('嵌入版 Python 解压后仍缺 python.exe、python310.zip、python310._pth 或 get-pip.py')
  }
  const pth = readFileSync(join(pythonDest, 'python310._pth'), 'utf8')
  if (!pth.includes('python310.zip')) {
    throw new Error('python310._pth 不像官方嵌入版')
  }
}

await stageAppRoot()
await stagePython()
