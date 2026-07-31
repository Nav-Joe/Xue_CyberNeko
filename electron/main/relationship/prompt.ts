/**
 * 关系姿态 → Prompt 纯文本（情感模拟指令）。
 * 「正常」档不加行为提示；三维全正常仍注入简档。
 */
import { isNeutralStage, resolveStageTag } from './engine'
import type { RelDimension, RelScores, RelStageTag } from './types'

const DIM_LABEL: Record<RelDimension, string> = {
  closeness: '亲近',
  trust: '信任',
  rapport: '投契'
}

/** 维护者锁定的各维 TAG 行为提示；「正常」无条目 */
export const RELATIONSHIP_TAG_HINTS: Partial<Record<RelStageTag, string>> = {
  厌恶: '你很讨厌用户...',
  疏远: '你和用户很有距离感...甚至不太想理TA...',
  冷淡: '你对用户的态度冷淡，不是很想推进关系',
  友好: '你对用户在友谊上有着不错的感情',
  亲近: '你开始尝试一点点越过友情的边界...',
  爱意: '你非常喜欢用户，发自内心的爱TA',

  心存芥蒂: '你完全不相信用户，甚至处处防备...（完全保住自己的任何隐私和秘密）',
  满腹狐疑: '你不太相信用户，甚至无法理解TA到底想做什么...',
  半信半疑: '你偏向于有点点不相信用户，但是还会给点相信的机会...',
  信任: '你相信用户不大可能做出出格的事情，但是也不会轻易透露你的隐私和小心思...',
  开诚相见: '你会跟用户分享自己的一些不好特别害羞的秘密和小心思，而且也相信着TA',
  毫不怀疑: '你已经完全相信用户，甚至可以付出自己的一切来相信着TA',

  毫无交集: '你和用户比陌生人还陌生人...像是处于两个世界...',
  不合: '你和用户完全不合拍...',
  尴尬: '你和用户在很多方面上不太合拍，处境尴尬...',
  融洽: '你虽然在某些方面上不同，但是总体融洽，还算合得来...',
  意气相投: '你和用户在很多方面上都很合拍。',
  灵魂双子: '你跟用户简直就和一个人一样，极其合拍，就像双子座无法割舍彼此，灵魂上完全契合...'
}

function formatScore(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  const t = Math.round(n * 100) / 100
  return String(t)
}

function renderDimLine(dimension: RelDimension, score: number): string {
  const tag = resolveStageTag(dimension, score)
  const head = `- ${DIM_LABEL[dimension]} ${formatScore(score)}｜${tag}`
  if (isNeutralStage(tag)) return head
  const hint = RELATIONSHIP_TAG_HINTS[tag]
  return hint ? `${head}：${hint}` : head
}

export function renderRelationshipPromptBlock(scores: RelScores): string {
  const lines = [
    '【当前关系姿态（情感模拟）】',
    renderDimLine('closeness', scores.closeness),
    renderDimLine('trust', scores.trust),
    renderDimLine('rapport', scores.rapport)
  ]
  return lines.join('\n')
}
