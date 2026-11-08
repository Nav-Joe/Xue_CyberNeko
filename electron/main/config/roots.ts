import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

/**
 * 未打包时两个根都是仓库根，和现在双击启动的找法一致。
 * 打包后程序目录会在升级时被换掉，模型和权重改放到本机数据目录。
 */
export const PACKAGED_PAYLOAD_DIR = 'app-root'
export const DATA_DIR_NAME = 'xue-cyber-neko'

/** 记忆和配置的目录名。快捷方式可以叫「雪澜」，这个名字不能跟着产品名变。 */
export function userDataDir(appData: string): string {
  return join(appData, DATA_DIR_NAME)
}

/** 官方参考音要 wav 和 txt 才算可用；meta 是样本身份。不拷运行时缓存。 */
const OFFICIAL_SAMPLE_SEED_FILES = ['reference.wav', 'reference.txt', 'meta.json'] as const

export type AppRoots = {
  installRoot: string
  dataRoot: string
}

export type RootsHost = {
  isPackaged: boolean
  cwd: string
  candidates: string[]
  resourcesPath: string
  localAppData: string
}

export function resolveDevRoot(candidates: string[], cwd: string): string {
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'voice_forge'))) {
      return dir
    }
  }
  return cwd
}

export function resolveAppRoots(host: RootsHost): AppRoots {
  if (!host.isPackaged) {
    const root = resolveDevRoot(host.candidates, host.cwd)
    return { installRoot: root, dataRoot: root }
  }
  if (!host.resourcesPath || !host.localAppData) {
    throw new Error('打包后的安装目录或本地数据目录不可用')
  }
  return {
    installRoot: join(host.resourcesPath, PACKAGED_PAYLOAD_DIR),
    dataRoot: join(host.localAppData, DATA_DIR_NAME)
  }
}

export function ensureOfficialSampleSeed(installRoot: string, dataRoot: string): void {
  if (resolve(installRoot) === resolve(dataRoot)) return
  const sourceDir = join(installRoot, 'voice_forge', 'default_sample')
  const destDir = join(dataRoot, 'voice_forge', 'default_sample')
  if (existsSync(join(destDir, 'reference.wav'))) return
  if (!existsSync(join(sourceDir, 'reference.wav'))) return
  mkdirSync(destDir, { recursive: true })
  for (const name of OFFICIAL_SAMPLE_SEED_FILES) {
    const src = join(sourceDir, name)
    const dest = join(destDir, name)
    if (!existsSync(src) || existsSync(dest)) continue
    copyFileSync(src, dest)
  }
}

let hostOverride: RootsHost | null = null

/** 单测注入目录。生产路径不要调用。 */
export function setRootsHostForTests(host: RootsHost | null): void {
  hostOverride = host
}

function devCandidates(cwd: string): string[] {
  return [cwd, join(__dirname, '..', '..', '..'), join(__dirname, '..', '..'), join(__dirname, '..')]
}

function readHost(): RootsHost {
  if (hostOverride) return hostOverride
  const cwd = process.cwd()
  let isPackaged = false
  let resourcesPath = ''
  let localAppData = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      app?: { isPackaged?: boolean; getPath?: (name: string) => string }
    }
    if (electron.app?.isPackaged) {
      isPackaged = true
      resourcesPath = process.resourcesPath
      localAppData = electron.app.getPath?.('localAppData') ?? ''
    }
  } catch {
    isPackaged = false
  }
  return {
    isPackaged,
    cwd,
    candidates: devCandidates(cwd),
    resourcesPath,
    localAppData
  }
}

export function currentRoots(): AppRoots {
  return resolveAppRoots(readHost())
}

export function installRoot(): string {
  return currentRoots().installRoot
}

export function dataRoot(): string {
  const roots = currentRoots()
  if (resolve(roots.installRoot) !== resolve(roots.dataRoot)) {
    mkdirSync(roots.dataRoot, { recursive: true })
  }
  return roots.dataRoot
}
