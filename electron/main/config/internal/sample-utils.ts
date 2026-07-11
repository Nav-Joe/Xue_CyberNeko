import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export function sanitizeDisplayName(raw: string): string {
  return raw.trim().replace(/[<>:"/\\|?*]/g, '').slice(0, 32).trim()
}

export function readProfileDisplayName(sampleDir: string, fallback: string): string {
  const profilePath = join(sampleDir, 'profile.json')
  if (!existsSync(profilePath)) {
    return fallback
  }
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { displayName?: string }
    if (typeof profile.displayName === 'string' && profile.displayName.trim()) {
      return profile.displayName.trim()
    }
  } catch {
    // ignore
  }
  return fallback
}

export function sampleHasReference(sampleDir: string): boolean {
  return existsSync(join(sampleDir, 'reference.wav'))
}

export function generateSampleFolderId(): string {
  return `vf_${randomBytes(4).toString('hex')}`
}

export function readSampleInstruct(sampleDir: string): string | null {
  const profilePath = join(sampleDir, 'profile.json')
  if (!existsSync(profilePath)) {
    return null
  }
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { instruct?: string }
    if (typeof profile.instruct === 'string' && profile.instruct.trim()) {
      return profile.instruct.trim()
    }
  } catch {
    // ignore
  }
  return null
}

export function writeSampleInstruct(sampleDir: string, instruct: string): void {
  const trimmed = instruct.trim()
  if (!trimmed) {
    return
  }
  const profilePath = join(sampleDir, 'profile.json')
  let profile: Record<string, unknown> = {}
  if (existsSync(profilePath)) {
    try {
      profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>
    } catch {
      profile = {}
    }
  }
  profile.instruct = trimmed
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
}
