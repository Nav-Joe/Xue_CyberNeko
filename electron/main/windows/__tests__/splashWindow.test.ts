import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../logging/logger', () => ({
  logWarn: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  app: { getAppPath: () => process.cwd() }
}))

const showPetWindowIfNeeded = vi.fn()
const setDeferPetWindowShow = vi.fn()

vi.mock('../petWindow', () => ({
  showPetWindowIfNeeded: (...args: unknown[]) => showPetWindowIfNeeded(...args),
  setDeferPetWindowShow: (...args: unknown[]) => setDeferPetWindowShow(...args)
}))

describe('splashWindow dual-gate finish', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('pet frame alone does not show pet; closeSplash still releases defer', async () => {
    const mod = await import('../splashWindow')
    mod.markSplashPetFrameReady()
    expect(showPetWindowIfNeeded).not.toHaveBeenCalled()

    mod.closeSplashWindow()
    expect(setDeferPetWindowShow).toHaveBeenCalledWith(false)
    expect(showPetWindowIfNeeded).toHaveBeenCalled()
  })

  it('closeSplashWindow is idempotent', async () => {
    const mod = await import('../splashWindow')
    mod.closeSplashWindow()
    mod.closeSplashWindow()
    expect(showPetWindowIfNeeded).toHaveBeenCalled()
  })
})
