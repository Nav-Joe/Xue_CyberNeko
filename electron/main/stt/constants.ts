/** 与 stt_service/CONTRACT §2.1 一致 */
export const STT_PORT_CANDIDATES = [8767, 8768, 8769, 8770, 8771, 8772] as const

export const STT_HOST = '127.0.0.1'

/** 首次加载 SenseVoice 可能较慢 */
export const STT_READY_TIMEOUT_MS = 120_000

export const STT_HEALTH_POLL_MS = 500
