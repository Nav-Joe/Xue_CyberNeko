/** 常见 llama-server 监听地址（OpenAI 兼容 /v1） */
export const LLAMA_PROBE_BASE_URLS = [
  'http://127.0.0.1:8010',
  'http://127.0.0.1:8011',
  'http://127.0.0.1:8012',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'http://localhost:8010',
  'http://localhost:8080'
] as const

export const DEFAULT_LLAMA_BASE_URL = 'http://127.0.0.1:8010'
export const DEFAULT_LOCAL_MODEL_ID = 'qwen2.5:3b'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const LLM_CHAT_TIMEOUT_MS = 120_000
export const LLM_DEFAULT_TEMPERATURE = 0.7
export const LLAMA_PROBE_TIMEOUT_MS = 4_000
