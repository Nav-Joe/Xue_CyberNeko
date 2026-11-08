import { connect as connectTls, type TLSSocket } from 'tls'
import { randomBytes, randomUUID } from 'crypto'

import { generateSecMsGecV2 } from './edgeToken'
import { mapQwenNetworkError } from './mapQwenFailure'
import { DEFAULT_EDGE_WSS_URL, type TtsCloudConfig, type TtsCloudSynthResult } from './types'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const SEC_MS_GEC_VERSION = '2-143.0.3650.75'
const CHROMIUM_MAJOR = '143'

export type SynthesizeEdgeInput = {
  config: TtsCloudConfig
  text: string
  signal?: AbortSignal
}

function edgeTimestamp(): string {
  const date = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildSocketUrl(baseUrl: string): URL {
  const url = new URL(baseUrl.trim() || DEFAULT_EDGE_WSS_URL)
  if (!url.searchParams.has('TrustedClientToken')) {
    url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN)
  }
  url.searchParams.set('ConnectionId', randomUUID().replace(/-/g, ''))
  url.searchParams.set('Sec-MS-GEC', generateSecMsGecV2())
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION)
  return url
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4)
  const header = [0x80 | opcode]
  if (payload.length < 126) header.push(0x80 | payload.length)
  else if (payload.length < 65536) header.push(0x80 | 126, payload.length >> 8, payload.length & 0xff)
  else throw new Error('Edge 文本过长')
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4]
  return Buffer.concat([Buffer.from(header), mask, masked])
}

function readFrames(socket: TLSSocket, signal?: AbortSignal): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const audio: Buffer[] = []
    let buffer = Buffer.alloc(0)
    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f
        let length = buffer[1] & 0x7f
        let offset = 2
        if (length === 126) {
          if (buffer.length < 4) return
          length = buffer.readUInt16BE(2)
          offset = 4
        } else if (length === 127) {
          fail(new Error('Edge 返回了过长的数据帧'))
          return
        }
        if (buffer.length < offset + length) return
        const payload = buffer.subarray(offset, offset + length)
        buffer = buffer.subarray(offset + length)
        if (opcode === 0x8) {
          cleanup()
          resolve(audio)
          return
        }
        if (opcode === 0x1) {
          if (payload.includes(Buffer.from('Path:turn.end'))) {
            cleanup()
            resolve(audio)
            return
          }
        } else if (opcode === 0x2 && payload.length >= 2) {
          const headerLength = payload.readUInt16BE(0)
          if (headerLength + 2 > payload.length) continue
          const header = payload.subarray(2, 2 + headerLength).toString('utf8')
          if (!header.includes('Path:audio')) continue
          const data = payload.subarray(2 + headerLength + 2)
          if (header.includes('Content-Type:audio/mpeg') && data.length > 0) audio.push(Buffer.from(data))
        }
      }
    }
    const onAbort = () => fail(new Error('合成已取消'))
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', fail)
      signal?.removeEventListener('abort', onAbort)
    }
    socket.on('data', onData)
    socket.on('error', fail)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function openEdgeSocket(url: URL, signal?: AbortSignal): Promise<TLSSocket> {
  const key = randomBytes(16).toString('base64')
  const request = [
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    'Pragma: no-cache',
    'Cache-Control: no-cache',
    'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
    `Cookie: muid=${randomBytes(16).toString('hex').toUpperCase()};`,
    '',
    ''
  ].join('\r\n')

  return new Promise((resolve, reject) => {
    const socket = connectTls({ host: url.hostname, port: 443, servername: url.hostname }, () => {
      socket.write(request)
    })
    let header = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      header = Buffer.concat([header, chunk])
      const split = header.indexOf('\r\n\r\n')
      if (split < 0) return
      socket.off('data', onData)
      const status = header.subarray(0, header.indexOf('\r\n')).toString('utf8')
      if (!status.includes(' 101 ')) {
        socket.destroy()
        reject(new Error(status.includes('403') ? 'Edge TTS 拒绝了访问令牌' : `Edge TTS 连接失败：${status}`))
        return
      }
      const rest = header.subarray(split + 4)
      if (rest.length > 0) socket.unshift(rest)
      resolve(socket)
    }
    socket.on('data', onData)
    socket.on('error', reject)
    signal?.addEventListener('abort', () => {
      socket.destroy()
      reject(new Error('合成已取消'))
    }, { once: true })
  })
}

export async function synthesizeEdgeTts(input: SynthesizeEdgeInput): Promise<TtsCloudSynthResult> {
  const text = input.text.trim()
  if (!text) return { ok: false, detail: '合成文本为空' }
  const edge = input.config.edge
  const voice = edge.voices.find((item) => item.id === edge.activeVoiceLocalId)
  if (!voice?.speaker.trim()) return { ok: false, detail: '请先选择一条 Edge 声线' }

  const url = buildSocketUrl(edge.baseUrl)
  let socket: TLSSocket
  try {
    socket = await openEdgeSocket(url, input.signal)
  } catch (error) {
    return { ok: false, detail: mapQwenNetworkError(url.toString(), error instanceof Error ? error.message : '网络错误') }
  }

  const stamp = edgeTimestamp()
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice.speaker.trim()}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`
  const configMessage =
    `X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
  const ssmlMessage =
    `X-RequestId:${randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n${ssml}`

  try {
    const frames = readFrames(socket, input.signal)
    socket.write(encodeFrame(0x1, Buffer.from(configMessage)))
    socket.write(encodeFrame(0x1, Buffer.from(ssmlMessage)))
    const audio = await frames
    socket.end()
    if (audio.length === 0) return { ok: false, detail: 'Edge 未返回音频' }
    const merged = Buffer.concat(audio)
    return { ok: true, audio: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength), mime: 'audio/mpeg' }
  } catch (error) {
    socket.destroy()
    return { ok: false, detail: error instanceof Error ? error.message : 'Edge 合成失败' }
  }
}
