import { describe, expect, it, vi } from 'vitest'
import type { NativeImage, Size } from 'electron'

import { capturePrimaryScreen, resolveThumbnailSize } from '../capture'

function fakeImage(empty: boolean, png: Buffer, jpeg: Buffer): NativeImage {
  return {
    isEmpty: () => empty,
    toPNG: () => png,
    toJPEG: () => jpeg
  } as unknown as NativeImage
}

describe('resolveThumbnailSize', () => {
  it('uses half workArea when under max long edge', () => {
    expect(resolveThumbnailSize({ width: 1920, height: 1080 }, 1280)).toEqual({
      width: 960,
      height: 540
    })
  })

  it('scales down when half long edge exceeds max', () => {
    const size = resolveThumbnailSize({ width: 3840, height: 2160 }, 1280)
    expect(size.width).toBeLessThanOrEqual(1280)
    expect(size.height).toBeLessThanOrEqual(1280)
    expect(Math.max(size.width, size.height)).toBe(1280)
  })
})

describe('capturePrimaryScreen', () => {
  it('throws when enabled=false without calling capturer', async () => {
    const getSources = vi.fn()
    await expect(
      capturePrimaryScreen({
        enabled: false,
        deps: { getSources, getPrimaryWorkArea: () => ({ width: 100, height: 100 }) }
      })
    ).rejects.toThrow(/enabled=false/)
    expect(getSources).not.toHaveBeenCalled()
  })

  it('returns jpeg buffer metrics without persisting', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff])
    const png = Buffer.from([0x89, 0x50])
    const workArea: Size = { width: 1920, height: 1080 }
    const getSources = vi.fn(async () => [
      { id: 'screen:0', name: 'Entire Screen', thumbnail: fakeImage(false, png, jpeg) }
    ])

    const result = await capturePrimaryScreen({
      enabled: true,
      format: 'jpeg',
      jpegQuality: 70,
      deps: {
        getPrimaryWorkArea: () => workArea,
        getSources
      }
    })

    expect(getSources).toHaveBeenCalledOnce()
    expect(result.format).toBe('jpeg')
    expect(result.bytes.equals(jpeg)).toBe(true)
    expect(result.thumbnailSize).toEqual({ width: 960, height: 540 })
    expect(result.captureMs).toBeGreaterThanOrEqual(0)
    expect(result.encodeMs).toBeGreaterThanOrEqual(0)
  })

  it('throws on empty thumbnail', async () => {
    await expect(
      capturePrimaryScreen({
        enabled: true,
        deps: {
          getPrimaryWorkArea: () => ({ width: 800, height: 600 }),
          getSources: async () => [
            {
              id: 'screen:0',
              name: 'Empty',
              thumbnail: fakeImage(true, Buffer.alloc(0), Buffer.alloc(0))
            }
          ]
        }
      })
    ).rejects.toThrow(/empty thumbnail/)
  })
})
