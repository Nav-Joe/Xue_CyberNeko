export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function computeDownloadPercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

export function formatDownloadProgressText(done: number, total: number): string {
  if (total > 0) {
    return `${formatByteSize(done)} / ${formatByteSize(total)}`
  }
  if (done > 0) {
    return `已下载 ${formatByteSize(done)}`
  }
  return '准备下载…'
}
