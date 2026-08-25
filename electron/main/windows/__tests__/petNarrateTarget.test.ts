import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockWindows, electronMock } = vi.hoisted(() => {
  const mockWindows: Array<{
    destroyed: boolean
    url: string
    title: string
    webContents: { id: number; getURL: () => string; isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> }
  }> = []

  const electronMock = {
    webContents: {
      fromId: (id: number) => {
        const win = mockWindows.find((w) => w.webContents.id === id)
        if (!win || win.destroyed) return null
        return win.webContents
      }
    },
    BrowserWindow: {
      getAllWindows: () =>
        mockWindows.map((w) => ({
          isDestroyed: () => w.destroyed,
          getTitle: () => w.title,
          webContents: w.webContents
        }))
    }
  }

  return { mockWindows, electronMock }
})

vi.mock('electron', () => ({
  ...electronMock,
  default: electronMock
}))

import {
  describePetNarrateResolveFailure,
  registerPetNarrateTarget,
  resetPetNarrateTargetRegistry,
  resolvePetNarrateWebContents
} from '../petNarrateTarget'

describe('petNarrateTarget', () => {
  beforeEach(() => {
    mockWindows.length = 0
    resetPetNarrateTargetRegistry()
  })

  it('resolves registered webContents id', () => {
    const send = vi.fn()
    mockWindows.push({
      destroyed: false,
      url: 'http://localhost:5173/#pet',
      title: '雪澜赛博猫娘',
      webContents: {
        id: 42,
        getURL: () => 'http://localhost:5173/#pet',
        isDestroyed: () => false,
        send
      }
    })
    registerPetNarrateTarget(42)
    const wc = resolvePetNarrateWebContents()
    expect(wc?.id).toBe(42)
  })

  it('falls back to #pet window when registration stale', () => {
    registerPetNarrateTarget(999)
    mockWindows.push({
      destroyed: false,
      url: 'http://localhost:5173/#pet',
      title: '雪澜赛博猫娘',
      webContents: {
        id: 7,
        getURL: () => 'http://localhost:5173/#pet',
        isDestroyed: () => false,
        send: vi.fn()
      }
    })
    const wc = resolvePetNarrateWebContents()
    expect(wc?.id).toBe(7)
  })

  it('ignores home and chat windows', () => {
    mockWindows.push(
      {
        destroyed: false,
        url: 'http://localhost:5173/#home',
        title: '雪澜的家',
        webContents: {
          id: 1,
          getURL: () => 'http://localhost:5173/#home',
          isDestroyed: () => false,
          send: vi.fn()
        }
      },
      {
        destroyed: false,
        url: 'http://localhost:5173/#chat',
        title: 'chat',
        webContents: {
          id: 2,
          getURL: () => 'http://localhost:5173/#chat',
          isDestroyed: () => false,
          send: vi.fn()
        }
      }
    )
    expect(resolvePetNarrateWebContents()).toBeNull()
    expect(describePetNarrateResolveFailure().windowCount).toBe(2)
  })
})
