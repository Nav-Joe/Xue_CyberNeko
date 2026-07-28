/**
 * 记忆后台调度（OPT-10）：fire-and-forget，不 await。
 * 禁止把 consolidate / period 总结放进「首 token 之前」的 await 链。
 */
export function scheduleMemoryBackground(
  label: string,
  task: () => void | Promise<unknown>
): void {
  try {
    void Promise.resolve()
      .then(() => task())
      .catch((error: unknown) => {
        console.warn(`[memory-bg] ${label}`, error)
      })
  } catch (error) {
    console.warn(`[memory-bg] ${label} sync throw`, error)
  }
}
