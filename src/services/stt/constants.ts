/** 与 stt_service/CONTRACT.md §2.1 一致；禁止写死只认 8767 */
export const STT_PORT_CANDIDATES = [8767, 8768, 8769, 8770, 8771, 8772] as const

export const STT_SAMPLE_RATE = 16_000

export const STT_MAX_DURATION_SEC = 60

export const STT_HEALTH_PATH = '/health'

export const STT_RECOGNIZE_PATH = '/v1/recognize'
