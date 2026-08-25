/**
 * 陪玩旁白专用切句：逗号、顿号等停顿处就断开；不要和聊天的句末切分混用。
 */

/** 任意停顿标点即切分（含逗号、顿号）；分隔符不进入段内。 */
const COMPANION_TTS_BREAK = /[，、。！？；：\n….,!?;:]/u

/**
 * 陪玩旁白：在逗号、顿号等停顿标点处切段，降低首段 TTS 延迟。
 * 例：「我是雪澜，一只猫娘」→「我是雪澜」「一只猫娘」
 */
export function splitTextForCompanionTts(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const segments: string[] = []
  let buf = ''

  for (const ch of trimmed) {
    if (COMPANION_TTS_BREAK.test(ch)) {
      const piece = buf.trim()
      if (piece) segments.push(piece)
      buf = ''
      continue
    }
    buf += ch
  }

  const tail = buf.trim()
  if (tail) segments.push(tail)

  return segments
}
