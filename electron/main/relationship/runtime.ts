/**
 * 读当前三维分生成注入文本。只读，不改分、不调鉴定 LLM。
 */
import type { MemoryDatabase } from '../memory/dbCore'
import { renderRelationshipPromptBlock } from './prompt'
import { getRelationshipScores } from './store'

export function buildRelationshipPromptBlock(db: MemoryDatabase): string {
  return renderRelationshipPromptBlock(getRelationshipScores(db))
}
