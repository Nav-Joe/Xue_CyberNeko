import { afterEach, describe, expect, it } from 'vitest'
import {
  HOME_APPEARANCE_KEY,
  parseHomeAppearance,
  readHomeAppearance,
  subscribeHomeAppearance,
  toggleHomeAppearance,
  writeHomeAppearance
} from '../homeAppearance'

describe('homeAppearance', () => {
  afterEach(() => {
    localStorage.removeItem(HOME_APPEARANCE_KEY)
  })

  it('defaults to light when unset or invalid', () => {
    expect(readHomeAppearance()).toBe('light')
    localStorage.setItem(HOME_APPEARANCE_KEY, 'sepia')
    expect(readHomeAppearance()).toBe('light')
  })

  it('persists dark and light', () => {
    writeHomeAppearance('dark')
    expect(localStorage.getItem(HOME_APPEARANCE_KEY)).toBe('dark')
    expect(readHomeAppearance()).toBe('dark')
    writeHomeAppearance('light')
    expect(readHomeAppearance()).toBe('light')
  })

  it('toggles between light and dark', () => {
    expect(toggleHomeAppearance('light')).toBe('dark')
    expect(toggleHomeAppearance('dark')).toBe('light')
  })

  it('parses only dark as dark', () => {
    expect(parseHomeAppearance('dark')).toBe('dark')
    expect(parseHomeAppearance('light')).toBe('light')
    expect(parseHomeAppearance('sepia')).toBe('light')
  })

  it('applies storage events from other windows', () => {
    const seen: string[] = []
    const stop = subscribeHomeAppearance((next) => {
      seen.push(next)
    })
    localStorage.setItem(HOME_APPEARANCE_KEY, 'dark')
    window.dispatchEvent(
      new StorageEvent('storage', { key: HOME_APPEARANCE_KEY, newValue: 'dark' })
    )
    expect(seen).toEqual(['dark'])
    stop()
  })
})
