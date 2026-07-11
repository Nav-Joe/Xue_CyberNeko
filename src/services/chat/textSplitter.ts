/** 句末切分符：。！？换行及省略号；不含逗号 */
const SENTENCE_END = /[。！？\n…]/u

/** 颜文字 / 表情里常见符号（正常中文叙述里极少出现） */
const KAOMOJI_SYMBOL =
  /[´｀ˊˋˇ^~;*•·ωΩ∀Ддзツシッゝゞ°□△▿╯╰╮╭┻┣┫━┃│┏┓└┘♪✧☆★‿ᴗー_+=<>|\\/]/u

/** 无括号的 ASCII / 混合颜文字 */
const STANDALONE_KAOMOJI =
  /\^[_^~•\-]*\^|>[_<\s]*<|T[_\s]*T|QAQ|Orz|orz|XD|xD|O_o|0_o|-[_-]{1,}|[=:;8][-^]?[)(DP/\\|p3]|;\)|\^\^/gi

const BRACKETED_KAOMOJI = /[(（]([^)）\n]{1,48}[)）])/gu

function isBracketedKaomoji(inner: string): boolean {
  if (KAOMOJI_SYMBOL.test(inner)) {
    return true
  }
  const compact = inner.replace(/\s+/g, '')
  if (!compact) {
    return false
  }
  if (/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/u.test(compact)) {
    return false
  }
  const nonAlnum = compact.replace(/[a-zA-Z0-9]/g, '').length
  return nonAlnum / compact.length >= 0.4
}

/**
 * 检测文本是否含颜文字（括号表情或 ^_^ / QAQ 等）。
 */
export function containsKaomoji(text: string): boolean {
  if (!text.trim()) {
    return false
  }
  if (STANDALONE_KAOMOJI.test(text)) {
    STANDALONE_KAOMOJI.lastIndex = 0
    return true
  }
  STANDALONE_KAOMOJI.lastIndex = 0
  for (const match of text.matchAll(/[(（]([^)）\n]{1,48}[)）])/gu)) {
    if (isBracketedKaomoji(match[1] ?? '')) {
      return true
    }
  }
  return false
}

/**
 * 供 TTS 推理用：去掉颜文字，保留正文与标点；展示文本仍用原分段。
 */
export function stripKaomojiForTts(text: string): string {
  let result = text.replace(BRACKETED_KAOMOJI, (match, inner: string) =>
    isBracketedKaomoji(inner) ? '' : match
  )
  result = result.replace(STANDALONE_KAOMOJI, '')
  STANDALONE_KAOMOJI.lastIndex = 0
  return result.replace(/\s{2,}/g, ' ').trim()
}

/**
 * 供 TTS 推理用：去掉 emoji，保留标点与正文；展示文本仍用原分段。
 */
export function stripEmojiForTts(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** TTS 推理前去掉 emoji 与颜文字；UI 展示仍保留原文。 */
export function stripTextForTts(text: string): string {
  return stripKaomojiForTts(stripEmojiForTts(text))
}

/**
 * 将完整文本按句末标点切分为 TTS 分段。
 * 保留标点在本段末尾；空段丢弃。
 */
export function splitTextForTts(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const segments: string[] = []
  let buf = ''

  for (const ch of trimmed) {
    buf += ch
    if (SENTENCE_END.test(ch)) {
      const piece = buf.trim()
      if (piece) segments.push(piece)
      buf = ''
    }
  }

  const tail = buf.trim()
  if (tail) segments.push(tail)

  return segments
}

/**
 * 流式追加：返回本次新完成的整句分段，buffer 保留未完结尾部。
 */
export function drainCompleteTtsSegments(
  buffer: string,
  incoming: string
): { segments: string[]; rest: string } {
  const combined = buffer + incoming
  const segments: string[] = []
  let buf = ''

  for (const ch of combined) {
    buf += ch
    if (SENTENCE_END.test(ch)) {
      const piece = buf.trim()
      if (piece) segments.push(piece)
      buf = ''
    }
  }

  return { segments, rest: buf }
}
