/**
 * 视觉识图摘要的长度/请求上限（单一真相源）。
 * 改数字先改这里，并同步 CONTRACT「视觉摘要长度约定」。
 */

/** 提示词里告诉模型的目标长度（汉字量级，软约束） */
export const VISION_SUMMARY_TARGET_CHARS = 100

/**
 * 识图返回正文落库/注入旁白前的硬截断。
 * 只砍屏幕摘要，不截旁白 LLM 输出；略宽于目标字数以免丢细节。
 */
export const VISION_SUMMARY_MAX_CHARS = 300

/**
 * OpenAI 兼容 chat/completions 的 max_tokens。
 * 需能覆盖硬截断量级的中文输出，否则 300 字硬保险形同虚设。
 */
export const VISION_SUMMARY_MAX_TOKENS = 400

export const VISION_SUMMARY_TEMPERATURE = 0.2

/** 缩略图识图：低细节以省流量/延迟 */
export const VISION_IMAGE_DETAIL = 'low' as const
