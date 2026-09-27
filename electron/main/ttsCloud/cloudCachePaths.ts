import { join, resolve, sep } from 'path'

import { TTS_CLOUD_CACHE_DIR_NAME } from './types'

/**
 * 云音色本地 id：仅字母数字开头，后续可含 _-，最长 128。
 * 拒绝 `..`、路径分隔符等，避免拼进缓存目录后越权删盘。
 */
const SAFE_CLOUD_LOCAL_VOICE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/

export function isSafeCloudLocalVoiceId(localVoiceId: string): boolean {
  return SAFE_CLOUD_LOCAL_VOICE_ID.test(localVoiceId)
}

/** 非法则抛错；合法返回原串（不做 trim，调用方自行规范化）。 */
export function assertSafeCloudLocalVoiceId(localVoiceId: string): string {
  if (!isSafeCloudLocalVoiceId(localVoiceId)) {
    throw new Error('非法音色 id')
  }
  return localVoiceId
}

function normalizePathForCompare(p: string): string {
  const resolved = resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** resolved 必须落在 root 内（含 root 自身）。 */
export function isPathInsideOrEqual(root: string, candidate: string): boolean {
  const rootNorm = normalizePathForCompare(root)
  const candidateNorm = normalizePathForCompare(candidate)
  if (candidateNorm === rootNorm) return true
  const prefix = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep
  return candidateNorm.startsWith(prefix)
}

/**
 * 云端预热缓存根目录。
 * 与本地 voice_forge 下的 touch_cache 分开，避免混用。
 */
export function getTtsCloudCacheRoot(userDataPath: string): string {
  return join(userDataPath, TTS_CLOUD_CACHE_DIR_NAME)
}

/**
 * 单条云音色的缓存目录（按本地 voices[].id）。
 * 先过 id 字符集，再 resolve + 路径包含断言，挡住 `..` 穿越。
 */
export function getTtsCloudVoiceCacheDir(userDataPath: string, localVoiceId: string): string {
  const id = assertSafeCloudLocalVoiceId(localVoiceId.trim())
  const cacheRoot = resolve(getTtsCloudCacheRoot(userDataPath))
  const resolved = resolve(cacheRoot, id)
  if (!isPathInsideOrEqual(cacheRoot, resolved)) {
    throw new Error('非法音色 id')
  }
  return resolved
}

export function getTtsCloudVoiceCorpusPath(userDataPath: string, localVoiceId: string): string {
  return join(getTtsCloudVoiceCacheDir(userDataPath, localVoiceId), 'corpus.snapshot.json')
}

export function getTtsCloudVoiceManifestPath(userDataPath: string, localVoiceId: string): string {
  return join(getTtsCloudVoiceCacheDir(userDataPath, localVoiceId), 'cache', 'manifest.json')
}

export function getTtsCloudVoiceWavPath(
  userDataPath: string,
  localVoiceId: string,
  textKey: string
): string {
  return join(getTtsCloudVoiceCacheDir(userDataPath, localVoiceId), 'cache', textKey, '0.wav')
}

export function getTtsCloudVoicePointerPath(userDataPath: string, localVoiceId: string): string {
  return join(getTtsCloudVoiceCacheDir(userDataPath, localVoiceId), 'touch_cache.json')
}
