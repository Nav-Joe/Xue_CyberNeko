import { spawn } from 'child_process'
import { rmSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'

import { dataRoot, installRoot } from '../config/paths'
import { isPackagedLayout, live2dInstallPlan, runtimeInstallEnv } from './installPlan'
import { ensurePackagedPythonReady, packagedPythonSourceDir } from './pythonRuntime'
import {
  downloadDefaultLocalModelFile,
  ensureLlamaServerExe
} from '../llama/sessionBootstrapAssets'
import { live2dModelFiles, readRuntimeEnvStatus } from './status'
import type { RuntimeComponentId, RuntimeEnvJobResult } from './types'

let jobRunning = false

function assertInside(root: string, target: string): void {
  const base = resolve(root)
  const abs = resolve(target)
  const rel = relative(base, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('拒绝删除项目目录以外的路径')
  }
}

function removeInside(root: string, target: string): void {
  assertInside(root, target)
  rmSync(target, { recursive: true, force: true })
}

function runCommand(
  command: string,
  args: string[],
  onLine: (line: string) => void,
  extraEnv?: Record<string, string>
): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: dataRoot(),
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      shell: false
    })
    const push = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const text = line.trim()
        if (text) onLine(text)
      }
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('error', reject)
    child.on('close', (code) => resolveExit(code ?? 1))
  })
}

function cmdLine(inner: string, onLine: (line: string) => void, extraEnv?: Record<string, string>): Promise<number> {
  // /c 只吃一条命令字符串，& 才会在同一条里生效。
  return runCommand('cmd.exe', ['/d', '/c', inner], onLine, extraEnv)
}

async function runCmdScript(scriptRel: string, onLine: (line: string) => void, extraEnv?: Record<string, string>): Promise<number> {
  // 脚本跟着程序走；下载和卸载的工作目录是数据根。未打包时这两个目录相同。
  const script = join(installRoot(), scriptRel)
  const env = { ...runtimeInstallEnv(installRoot(), dataRoot()), ...extraEnv }
  return cmdLine(`chcp 65001>nul & call "${script}"`, onLine, env)
}

async function withJob(work: () => Promise<RuntimeEnvJobResult>): Promise<RuntimeEnvJobResult> {
  if (jobRunning) {
    return { ok: false, detail: '已有安装或卸载在进行，请等它结束。' }
  }
  jobRunning = true
  try {
    return await work()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, detail }
  } finally {
    jobRunning = false
  }
}

async function installLive2d(acceptLicense: boolean, onLine: (line: string) => void): Promise<RuntimeEnvJobResult> {
  if (!acceptLicense) {
    return { ok: false, detail: '下载官方 Live2D 样板前需要先同意素材许可。' }
  }
  onLine('正在下载桃濑日和 PRO…')
  const plan = live2dInstallPlan({
    installRoot: installRoot(),
    dataRoot: dataRoot(),
    execPath: process.execPath
  })
  const code = await runCommand(plan.command, plan.args, onLine, plan.env)
  if (code !== 0) {
    return { ok: false, detail: 'Live2D 模型下载失败。也可自行放入模型后重新打开本页。' }
  }
  return { ok: true, detail: 'Live2D 模型已就绪。' }
}

async function installByScript(scriptRel: string, onLine: (line: string) => void, extraEnv?: Record<string, string>): Promise<RuntimeEnvJobResult> {
  if (isPackagedLayout(installRoot(), dataRoot())) {
    const python = await ensurePackagedPythonReady(
      packagedPythonSourceDir(installRoot()),
      dataRoot(),
      (command, args, line) => runCommand(command, args, line),
      onLine
    )
    if (!python.ok) return python
  }
  const code = await runCmdScript(scriptRel, onLine, extraEnv)
  if (code !== 0) {
    return { ok: false, detail: '安装未完成，请看上方输出。' }
  }
  return { ok: true, detail: '安装完成。' }
}

export function installRuntimeComponent(
  id: RuntimeComponentId,
  acceptLicense: boolean,
  onLine: (line: string) => void
): Promise<RuntimeEnvJobResult> {
  return withJob(async () => {
    const current = readRuntimeEnvStatus(dataRoot()).find((item) => item.id === id)
    if (!current?.canInstall) {
      return { ok: false, detail: '这项已经装好，或当前不能安装。' }
    }
    if (id === 'live2d-model') return installLive2d(acceptLicense, onLine)
    if (id === 'tts-sidecar') return installByScript('scripts\\win\\install-tts-deps.cmd', onLine)
    if (id === 'stt-sensevoice') {
      const deps = await installByScript('scripts\\win\\install-stt-deps.cmd', onLine)
      if (!deps.ok) return deps
      return installByScript('scripts\\win\\install-stt-models.cmd', onLine)
    }
    if (id === 'qwen-weights') return installByScript('scripts\\win\\install-qwen-models.cmd', onLine)
    if (id === 'llama-local') {
      await ensureLlamaServerExe((payload) => onLine(payload.message))
      await downloadDefaultLocalModelFile((payload) => onLine(payload.message))
      return { ok: true, detail: '本地聊天模型已就绪。' }
    }
    if (id === 'alt-engine-bert') {
      return installByScript('scripts\\setup-bert-vits2.cmd', onLine, { XUE_NONINTERACTIVE: '1' })
    }
    return { ok: false, detail: '未知组件。' }
  })
}

export function uninstallRuntimeComponent(id: RuntimeComponentId, onLine: (line: string) => void): Promise<RuntimeEnvJobResult> {
  return withJob(async () => {
    const root = dataRoot()
    const current = readRuntimeEnvStatus(root).find((item) => item.id === id)
    if (!current?.canUninstall) {
      return { ok: false, detail: current?.uninstallBlockedReason || '这项不能从这里卸载。' }
    }
    if (id === 'live2d-model') {
      const live = live2dModelFiles(root)
      if (!live.official || live.others.length === 0) {
        return { ok: false, detail: '这是当前唯一的模型，不能卸载。' }
      }
      onLine('正在移除官方样板…')
      removeInside(root, join(root, 'public', 'models', 'hiyori_pro'))
      return { ok: true, detail: '已移除官方样板，自备模型仍在。' }
    }
    if (id === 'stt-sensevoice') {
      onLine('正在删除听写模型…')
      removeInside(root, join(root, '.runtime', 'stt-models'))
      return { ok: true, detail: '已删除听写模型。虚拟环境里的依赖还在。' }
    }
    if (id === 'qwen-weights') {
      onLine('正在删除本地 Qwen 语音权重…')
      removeInside(root, join(root, 'Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'))
      removeInside(root, join(root, 'Qwen3_TTS', 'models', 'Qwen3-TTS-12Hz-0.6B-Base'))
      return { ok: true, detail: '已删除本地 Qwen 语音权重。' }
    }
    if (id === 'llama-local') {
      onLine('正在删除本应用下载的 llama 程序和默认模型…')
      removeInside(root, join(root, 'llama_bin'))
      removeInside(root, join(root, 'llama-server.exe'))
      removeInside(root, join(root, 'llama_models', 'qwen2.5-3b-instruct-q4_k_m.gguf'))
      return { ok: true, detail: '已删除默认本地聊天模型和 llama-server。其它 gguf 未动。' }
    }
    return { ok: false, detail: '这项不能从这里卸载。' }
  })
}
