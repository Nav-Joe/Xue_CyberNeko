/**
 * 发消息前：读开欲望 → 重逢升血写回 → Top-N → 注入文本。
 * 本路径不轮扣、不自动创建欲望。
 */
import type { MemoryDatabase } from '../memory/dbCore'
import {
  prepareDesiresForTurn,
  selectDesiresForPromptInject
} from './engine'
import { renderDesirePromptBlock } from './prompt'
import { listOpenDesires, saveDesireSnapshots } from './store'

export function buildDesirePromptBlock(
  db: MemoryDatabase,
  input?: { nowMs?: number; topN?: number }
): string {
  const nowMs = input?.nowMs ?? Date.now()
  const open = listOpenDesires(db)
  if (open.length === 0) return ''

  const prepared = prepareDesiresForTurn(open, nowMs)
  saveDesireSnapshots(db, prepared)

  const forInject = selectDesiresForPromptInject(prepared, input?.topN)
  return renderDesirePromptBlock(forInject)
}
