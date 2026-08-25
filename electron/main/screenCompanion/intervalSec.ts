export function clampIntervalSec(raw: unknown, fallback = 90): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(600, Math.max(30, Math.floor(n)))
}
