import { finalizeStreamContent, parseStreamPayload } from './llmOutputParser'
import type { ChatOutputFormat } from './types'

/** 解码 SSE 字节流，逐行回调 `data:` 内容 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onDataPayload: (payload: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = drainSseBuffer(buffer, onDataPayload)
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    drainSseBuffer(`${buffer}\n`, onDataPayload)
  }
}

export function drainSseBuffer(buffer: string, onDataPayload: (payload: string) => void): string {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trimStart()
    onDataPayload(payload)
  }

  return rest
}

/** 读取 SSE 流并聚合 assistant 文本 */
export async function readChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  format: ChatOutputFormat,
  onDelta?: (delta: string) => void
): Promise<string> {
  let accumulated = ''

  await consumeSseStream(body, (payload) => {
    const delta = parseStreamPayload(payload, format)
    if (!delta) return
    accumulated += delta
    onDelta?.(delta)
  })

  return finalizeStreamContent(accumulated, format)
}
