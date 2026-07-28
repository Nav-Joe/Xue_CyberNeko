/**
 * 本地 GGUF 是否可用的探测。
 *
 * 职责边界见 `./CONTRACT.md` §文件职责。
 */
import { join } from 'path'
import { statSync } from 'fs'

import { logInfo } from '../logging/logger'

import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_MODEL_FILENAME,
  MIN_USABLE_GGUF_BYTES
} from './constants'
import {
  cleanupModelDownloadPartials,
  isIncompleteDownloadFile,
  listGgufModelFiles
} from './download'
import { llamaModelsDir } from './paths'

export type LocalModelStatus = {
  hasLocalModelFile: boolean
  modelPath: string | null
  modelFilename: string | null
  defaultModelId: string
}

/**
 * 返回第一个「可用」本地 GGUF 路径。
 * 过小或未达 `.expected` 的文件视为残留并清理，不计入可用模型。
 */
export function resolveUsableLocalModelPath(): string | null {
  const modelsDir = llamaModelsDir()
  const models = listGgufModelFiles(modelsDir)
  if (models.length === 0) return null

  const candidates = models.includes(DEFAULT_MODEL_FILENAME)
    ? [DEFAULT_MODEL_FILENAME, ...models.filter((name) => name !== DEFAULT_MODEL_FILENAME)]
    : models

  for (const fileName of candidates) {
    const fullPath = join(modelsDir, fileName)
    try {
      const size = statSync(fullPath).size
      const tooSmall = size < MIN_USABLE_GGUF_BYTES
      const incomplete = isIncompleteDownloadFile(fullPath, size)
      if (tooSmall || incomplete) {
        logInfo(
          'llama',
          `忽略未完成的模型文件并清理: ${fileName} (${size} bytes${incomplete ? ', below expected' : ', below min'})`
        )
        cleanupModelDownloadPartials(modelsDir, [fullPath])
        continue
      }
      return fullPath
    } catch {
      continue
    }
  }
  return null
}

export function getLocalModelStatus(): LocalModelStatus {
  const modelPath = resolveUsableLocalModelPath()
  const modelFilename = modelPath ? modelPath.split(/[/\\]/).pop() ?? null : null
  return {
    hasLocalModelFile: Boolean(modelPath),
    modelPath,
    modelFilename,
    defaultModelId: DEFAULT_LOCAL_MODEL_ID
  }
}
