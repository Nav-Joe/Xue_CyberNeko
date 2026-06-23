import type { BodyPart } from '../types/corpus'

export const VOICE_FORGE_TITLE = '音色工坊'

export const VOICE_FORGE_TAB_UPDATE = '更新语料库'
export const VOICE_FORGE_TAB_CREATE = '创造新音色'

export const VOICE_FORGE_UPDATE_INTRO =
  '为已有声线单独编辑触摸台词。每条声线的语料库独立保存，在上方列表中选择要编辑的声线即可。'

export const VOICE_FORGE_CREATE_INTRO =
  '编写声线描述与触摸台词，生成新的克隆声线。完成后请在家窗口切换使用。'

export const VOICE_FORGE_HOME_HINT = '此处可编辑各声线语料，或创造新的克隆声线。'

export const CORPUS_EDITING_LABEL = '编辑声线'
export const CORPUS_PER_SAMPLE_HINT = '各声线语料库相互独立；保存并预热只影响当前所选声线。'
export const CORPUS_UNSAVED_SWITCH_CONFIRM =
  '当前语料尚未保存，切换编辑对象将丢弃未保存的更改。确定继续吗？'

export const SAVE_AND_PREWARM_LABEL = '保存并预热'

export const BODY_PART_ORDER: BodyPart[] = ['head', 'arms', 'body', 'legs', 'tail']

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  head: '头部',
  arms: '手臂',
  body: '身体',
  legs: '腿部',
  tail: '尾巴'
} as const

export const BODY_PART_HINTS: Record<BodyPart, string> = {
  head: '点击脸部与发顶区域时播放',
  arms: '点击肩、上臂、手部等两侧外缘时播放',
  body: '点击脖子、胸、腹、腰等躯干主区域时播放（其它部位为空时也会回退到这里）',
  legs: '点击大腿、丝袜与脚部等偏下区域时播放（裙摆以下）',
  tail: '目前没有尾巴，只是个占位符，写了也没用哦~'
} as const

export const VOICE_INSTRUCT_LABEL = '声线描述（提示词）'
export const VOICE_INSTRUCT_HINT =
  '用自然语言描述想要的音色与说话方式。生成声线时将据此合成克隆参考音。'

export const GENERATE_VOICE_LABEL = '生成声线'

export const CREATE_VOICE_CONFIRM =
  '将使用 VoiceDesign 生成克隆参考音，可能需要数分钟。期间请保持 TTS 窗口运行，完成后会自动弹出试听。确定开始吗？'

export const CREATE_VOICE_STARTED_HINT =
  '已开始生成克隆参考音。设置将关闭，桌宠窗口会显示进度；完成后请先试听再进入预热。'

export const CORPUS_PREWARM_LABEL = '保存并预热'
export const CORPUS_PREWARM_HINT =
  '保存当前所选声线的台词变更并增量预热语音缓存（仅重新合成有改动的句子）；不会重新生成或删除克隆参考音，提示词改动也不会生效。'
export const CORPUS_PREWARM_UNCHANGED_HINT = '语料与上次保存一致，无需预热。'
export const CORPUS_PREWARM_CONFIRM =
  '将保存「{name}」的语料库并增量预热（仅重新合成有改动的句子，不会重新生成声线）。桌宠将暂时隐藏并显示进度。确定吗？'

export const REGENERATE_VOICE_LABEL = '重新生成声线'
export const REGENERATE_VOICE_CONFIRM =
  '将根据当前声线描述重新生成克隆样本，并删除该样本目录内的旧音频。桌宠将暂时隐藏，完成后需再次试听确认。确定吗？'

export const VOICE_NAME_PROMPT_TITLE = '为这条声线命名'
export const VOICE_NAME_PROMPT_HINT = '名称便于您日后管理；文件夹将自动生成独立 ID（如 vf_a1b2c3d4）。'

export const OFFICIAL_CURATED_CLIPS_LABEL = '启用非语料库音频'
export const OFFICIAL_CURATED_CLIPS_HINT =
  '仅在使用官方默认声线时生效：开启时触摸播放精选预录音频；关闭时使用语料库 TTS（需已预热默认配置缓存，可在音色工坊「更新语料库」中保存预热）。'
export const OFFICIAL_CURATED_CLIPS_EMPTY_TITLE = '无法关闭'
export const OFFICIAL_CURATED_CLIPS_EMPTY_MESSAGE =
  '官方语料预热缓存为空。请先在音色工坊「更新语料库」中选择「默认配置」并保存预热后再关闭此开关。'
export const OFFICIAL_CURATED_CLIPS_NEED_OFFICIAL_HINT =
  '当前为自定义声线，此开关不可用。请回家窗口切换为「默认配置」后再调整。'

export const REALTIME_INFERENCE_LABEL = '触摸实时推理'
export const REALTIME_INFERENCE_HINT =
  '开启后每次点击走实时推理，不使用预热缓存。始终使用语料库 TTS（不会播放精选音频）。'
export const REALTIME_INFERENCE_OFFICIAL_HINT =
  '当前为官方默认声线：使用 default_sample 克隆参考音 + 该声线语料库。'
export const REALTIME_INFERENCE_CUSTOM_HINT =
  '当前为自定义声线：使用对应文件夹内的克隆参考音 + 该声线语料库。'
export const REALTIME_INFERENCE_NEED_ACTIVE_HINT =
  '请先在回家窗口选择并切换到要使用的声线（需已有克隆参考音）。'
export const REALTIME_INFERENCE_CURATED_CONFLICT =
  '已自动关闭「触摸实时推理」。精选音频与语料库实时推理不能同时启用。'

export const RESTART_FOR_CREATE_CONFIRM = CREATE_VOICE_CONFIRM

export const EXPERIMENTAL_UPLOAD_LABEL = '实验级功能'
export const EXPERIMENTAL_UPLOAD_WARNING =
  '请谨慎开启该功能！！！否则可能面临法律风险！！！'
export const EXPERIMENTAL_UPLOAD_HINT =
  '开启后可上传已有 WAV 作为克隆参考音。该能力不对外宣传，仅限个人合理使用。'

export const UPLOAD_VOICE_BUTTON_LABEL = '上传 WAV 音频'
export const UPLOAD_VOICE_REFERENCE_HINT =
  '请填写参考音频里实际说出的原文（与 WAV 内容一致），用于克隆对齐。'
export const UPLOAD_TRANSCRIPT_DIALOG_TITLE = '填写参考音频原文'
export const UPLOAD_TRANSCRIPT_DIALOG_HINT = UPLOAD_VOICE_REFERENCE_HINT
export const UPLOAD_TRANSCRIPT_CONFIRM_TITLE = '确认参考音频原文'
export const UPLOAD_TRANSCRIPT_CONFIRM_MESSAGE =
  '请确认以下文本与 WAV 中实际说出的内容完全一致。确认后将编辑触摸语料库。'
export const UPLOAD_CORPUS_DIALOG_TITLE = '编辑触摸语料库'
export const UPLOAD_CORPUS_DIALOG_HINT =
  '这些台词将用于克隆预热与桌宠触摸反馈。至少添加一句，建议先填好 body 分区。'

export const UPLOAD_RISK_DIALOG_TITLE = '实验功能警告'
export const UPLOAD_RISK_DIALOG_MESSAGE =
  '该功能目前属于本项目不宣传和提倡的功能，你确定要继续吗？'
export const UPLOAD_RISK_CANCEL_LABEL = '我怕了...'
export const UPLOAD_RISK_CONFIRM_LABEL = '我已知晓风险'

export const UPLOAD_AGREEMENT_TITLE = '上传参考音用户须知'
export const UPLOAD_AGREEMENT_BODY = `1. 您应保证对上传音频拥有合法使用权，不得上传未经授权的他人声音、受版权保护的录音或其他违法内容。
2. 上传音频仅限个人、非商业、合理范围内使用；禁止用于冒充他人、欺诈、骚扰、侵权或其他违法用途。
3. 因上传内容引发的纠纷、索赔或法律责任由您本人承担；本项目不对用户的上传行为承担担保责任。
4. 本说明不构成法律意见；继续即表示您理解并接受上述风险。`
export const UPLOAD_AGREEMENT_CHECKBOX =
  '我已知晓风险且保证上传的音频仅用于合理使用范围之内'
export const UPLOAD_AGREEMENT_WAIT_HINT = '请阅读须知，{seconds} 秒后可继续'
export const UPLOAD_AGREEMENT_CONTINUE_LABEL = '继续上传'
export const UPLOAD_VOICE_STARTED_HINT =
  '参考音已导入，设置将关闭；请在桌宠窗口试听确认后再预热语料。'

export const UPLOAD_VOICE_PLACEHOLDER_INSTRUCT = '（用户上传参考音，未使用 VoiceDesign 提示词）'
