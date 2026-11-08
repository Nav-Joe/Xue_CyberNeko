import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { getRendererUrl } from '../rendererLoader'
import { resolveRendererFile, selectRendererUrl } from '../rendererProtocol'

const rendererRoot = join('C:\\xue-renderer')
const modelsRoot = join('C:\\xue-models')
const roots = { rendererRoot, modelsRoot }

describe('resolveRendererFile', () => {
  it('maps a model file onto the data-root models directory', () => {
    const abs = resolveRendererFile(
      'xue://local/models/hiyori_pro/runtime/hiyori.model3.json',
      roots
    )
    expect(abs).toBe(join(modelsRoot, 'hiyori_pro', 'runtime', 'hiyori.model3.json'))
  })

  it('rejects parent segments and encoded parent segments', () => {
    expect(resolveRendererFile('xue://local/models/../secret.txt', roots)).toBeNull()
    expect(resolveRendererFile('xue://local/models/%2e%2e/secret.txt', roots)).toBeNull()
    expect(resolveRendererFile('xue://local/models/%2e%2e%2f%2e%2e%2fsecret.txt', roots)).toBeNull()
    expect(resolveRendererFile('xue://local/live2d/../../package.json', roots)).toBeNull()
  })

  it('rejects a drive path hidden under /models', () => {
    expect(resolveRendererFile('xue://local/models/C:/Windows/win.ini', roots)).toBeNull()
  })

  it('maps page files onto the built renderer directory', () => {
    expect(resolveRendererFile('xue://local/live2d/live2dcubismcore.min.js', roots)).toBe(
      join(rendererRoot, 'live2d', 'live2dcubismcore.min.js')
    )
    expect(resolveRendererFile('xue://local/touch_clips/manifest.json', roots)).toBe(
      join(rendererRoot, 'touch_clips', 'manifest.json')
    )
    expect(resolveRendererFile('xue://local/assets/index.js', roots)).toBe(
      join(rendererRoot, 'assets', 'index.js')
    )
    expect(resolveRendererFile('xue://local/index.html', roots)).toBe(join(rendererRoot, 'index.html'))
  })

  it('rejects a different host', () => {
    expect(resolveRendererFile('xue://other/index.html', roots)).toBeNull()
  })
})

describe('selectRendererUrl', () => {
  const previous = process.env['ELECTRON_RENDERER_URL']

  afterEach(() => {
    if (previous === undefined) delete process.env['ELECTRON_RENDERER_URL']
    else process.env['ELECTRON_RENDERER_URL'] = previous
  })

  it('keeps the dev server url when Vite is running', () => {
    expect(selectRendererUrl('http://127.0.0.1:5173', 'pet')).toBe('http://127.0.0.1:5173#pet')
    expect(selectRendererUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
  })

  it('uses xue://local when there is no dev server', () => {
    expect(selectRendererUrl(undefined, 'env')).toBe('xue://local/index.html#env')
    expect(selectRendererUrl(undefined)).toBe('xue://local/index.html')
  })

  it('getRendererUrl follows ELECTRON_RENDERER_URL', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173'
    expect(getRendererUrl('home')).toBe('http://127.0.0.1:5173#home')
    delete process.env['ELECTRON_RENDERER_URL']
    expect(getRendererUrl('env')).toBe('xue://local/index.html#env')
  })
})
