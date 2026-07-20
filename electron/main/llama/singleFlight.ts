/**
 * 全局单飞锁：并发调用复用第一次 Promise 结果。
 * 用于 beginLlamaChatSession，保证并发 bootstrap 只 spawn 一次。
 */
export type SingleFlightRunner<T> = (fn: () => Promise<T>) => Promise<T>

export function createSingleFlight<T>(): SingleFlightRunner<T> {
  let inflight: Promise<T> | null = null

  return (fn) => {
    if (inflight) return inflight
    inflight = Promise.resolve()
      .then(fn)
      .finally(() => {
        inflight = null
      })
    return inflight
  }
}
