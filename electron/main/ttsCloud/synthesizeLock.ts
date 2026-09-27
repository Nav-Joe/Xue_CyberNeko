/**
 * 云端 TTS 全局串行：同时只跑一个合成任务；后来者 FIFO 排队。
 * AbortSignal 在等待队列或执行中均可取消。
 */

type QueueEntry = {
  run: () => Promise<void>
  signal?: AbortSignal
  reject: (reason: unknown) => void
}

function abortError(): Error {
  const err = new Error('Aborted')
  err.name = 'AbortError'
  return err
}

export function createSynthesizeLock() {
  const queue: QueueEntry[] = []
  let active = false

  function pump(): void {
    if (active) return
    const next = queue.shift()
    if (!next) return

    if (next.signal?.aborted) {
      next.reject(abortError())
      pump()
      return
    }

    active = true
    void next
      .run()
      .catch(() => {
        /* 错误由调用方 Promise 承接 */
      })
      .finally(() => {
        active = false
        pump()
      })
  }

  function runExclusive<T>(fn: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }

      const entry: QueueEntry = {
        signal,
        reject,
        run: async () => {
          try {
            if (signal?.aborted) {
              reject(abortError())
              return
            }
            const value = await fn(signal)
            resolve(value)
          } catch (error) {
            reject(error)
          }
        }
      }

      const onAbort = (): void => {
        const idx = queue.indexOf(entry)
        if (idx >= 0) {
          queue.splice(idx, 1)
          reject(abortError())
        }
      }

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }

      queue.push(entry)
      pump()
    })
  }

  return {
    runExclusive,
    /** 测试用：当前是否有进行中任务 */
    isBusy: () => active || queue.length > 0,
    pendingCount: () => queue.length + (active ? 1 : 0)
  }
}

export const cloudSynthesizeLock = createSynthesizeLock()
