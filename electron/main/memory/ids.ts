import { randomUUID } from 'crypto'

export function newMemoryId(): string {
  return randomUUID()
}
