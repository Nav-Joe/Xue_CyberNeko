import { join } from 'path'
import { tmpdir } from 'os'

import { projectRoot, runtimeDir } from '../config/paths'

export const LLAMA_BIN_DIR_NAME = 'llama_bin'
export const LLAMA_MODELS_DIR_NAME = 'llama_models'
export const LLAMA_PID_FILE = 'llama-server.pid'
export const LLAMA_INSTALL_TEMP_DIR_NAME = 'xue-cyber-neko-llama-install'

export function llamaBinDir(): string {
  return join(projectRoot(), LLAMA_BIN_DIR_NAME)
}

export function llamaModelsDir(): string {
  return join(projectRoot(), LLAMA_MODELS_DIR_NAME)
}

/** 解压/下载临时目录（系统 temp，避免 dev 下 Vite 监视项目内文件导致 EBUSY） */
export function llamaInstallWorkDir(sessionId = Date.now().toString()): string {
  return join(tmpdir(), LLAMA_INSTALL_TEMP_DIR_NAME, sessionId)
}

export function llamaServerExeCandidates(): string[] {
  const root = projectRoot()
  return [
    join(root, 'llama-server.exe'),
    join(llamaBinDir(), 'llama-server.exe')
  ]
}

export function llamaPidFile(): string {
  // 仅诊断用途（人工排查）；kill / 存活判定不得读此文件（见 llama/CONTRACT.md）
  return join(runtimeDir(), LLAMA_PID_FILE)
}
