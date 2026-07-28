/**
 * llama 下载工具门面（OPT-12 B）。
 * 实现拆在 `downloadHttp.ts`（HTTP/镜像）与 `downloadArtifacts.ts`（partial/zip/sweep）。
 * 调用方继续从本文件 import，避免扩散改动面。
 */
export {
  DownloadAbortError,
  downloadFile,
  downloadFileWithMirrors,
  isDownloadAbortError,
  probeDownloadTotal,
  type DownloadFileOptions,
  type DownloadMirrorResult,
  type DownloadProgress
} from './downloadHttp'

export {
  cleanupModelDownloadPartials,
  clearExpectedDownloadSize,
  downloadPartialPath,
  extractZipWindows,
  findFileRecursive,
  flattenLlamaBin,
  hasIncompleteModelArtifacts,
  isIncompleteDownloadFile,
  listGgufModelFiles,
  readExpectedDownloadSize,
  removeDownloadArtifacts,
  removePartialFile,
  sweepIncompleteModelArtifacts,
  writeExpectedDownloadSize
} from './downloadArtifacts'
