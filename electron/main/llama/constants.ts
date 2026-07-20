/** llama.cpp Windows CPU 发行包（体积适中、兼容面广） */

export const LLAMA_RELEASE_TAG = 'b9474'

export const LLAMA_WIN_ZIP_NAME = `llama-${LLAMA_RELEASE_TAG}-bin-win-cpu-x64.zip`

export const LLAMA_WIN_ZIP_OFFICIAL_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE_TAG}/${LLAMA_WIN_ZIP_NAME}`



/** @deprecated 使用 buildLlamaWinZipMirrorUrls() */

export const LLAMA_WIN_ZIP_URL = LLAMA_WIN_ZIP_OFFICIAL_URL



/** GitHub Release 国内加速前缀（按优先级排列，失败时自动换下一个） */

const GITHUB_RELEASE_MIRROR_PREFIXES = [

  'https://ghfast.top/',

  'https://ghproxy.net/',

  'https://mirror.ghproxy.com/'

] as const



export function buildLlamaWinZipMirrorUrls(): string[] {

  const mirrored = GITHUB_RELEASE_MIRROR_PREFIXES.map((prefix) => `${prefix}${LLAMA_WIN_ZIP_OFFICIAL_URL}`)

  return [...mirrored, LLAMA_WIN_ZIP_OFFICIAL_URL]

}



/** 默认本地模型（展示名 qwen2.5:3b） */

export const DEFAULT_LOCAL_MODEL_ID = 'qwen2.5:3b'

export const DEFAULT_MODEL_FILENAME = 'qwen2.5-3b-instruct-q4_k_m.gguf'

export const DEFAULT_MODEL_HF_REPO = 'Qwen/Qwen2.5-3B-Instruct-GGUF'

const DEFAULT_MODEL_HF_PATH = `${DEFAULT_MODEL_HF_REPO}/resolve/main/${DEFAULT_MODEL_FILENAME}`



export const DEFAULT_MODEL_OFFICIAL_URL = `https://huggingface.co/${DEFAULT_MODEL_HF_PATH}`



/** @deprecated 使用 buildDefaultModelMirrorUrls() */

export const DEFAULT_MODEL_URL = DEFAULT_MODEL_OFFICIAL_URL



/** HuggingFace / ModelScope 国内镜像（按优先级排列） */

export function buildDefaultModelMirrorUrls(): string[] {

  return [

    `https://hf-mirror.com/${DEFAULT_MODEL_HF_PATH}`,

    `https://modelscope.cn/models/${DEFAULT_MODEL_HF_REPO}/resolve/master/${DEFAULT_MODEL_FILENAME}`,

    DEFAULT_MODEL_OFFICIAL_URL

  ]

}



export const LLAMA_SERVER_HOST = '127.0.0.1'
/** 默认端口；8080 常与 go-cqhttp / 代理冲突，故改用 8010 */
export const LLAMA_SERVER_PORT = 8010
export const LLAMA_SERVER_PORT_CANDIDATES = [8010, 8011, 8012, 8080, 8081, 8082] as const
export const LLAMA_READY_TIMEOUT_MS = 180_000
export const LLAMA_READY_POLL_MS = 800

/**
 * 小于此体积的 .gguf 视为未下完残留（无 .expected 时的兜底）。
 * 默认 Q4_K_M ≈ 2GB；换更小默认模型时须同步调整。
 */
export const MIN_USABLE_GGUF_BYTES = 1_200_000_000

