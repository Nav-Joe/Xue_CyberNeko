/**
 * 双端对照锚点
 * ─────────────────────────────────────────────────────────────────
 * Python 镜像：tts_voice/voice_runtime_repair.py → reconcile_runtime_voice_config()
 * TS 入口：    reconcileVoiceRuntimeConfig()
 *
 * 修改本文件任一规则时，必须同步审查 Python 侧，并更新 CONTRACT.md。
 *
 * 规则对照（TS 分支 → Python 分支）：
 *
 * | # | TS 条件 / 动作                              | Python 对应                          |
 * |---|---------------------------------------------|--------------------------------------|
 * | 1 | session.phase === 'cancelled'               | （无等价；TS 独有，调用 cancelReview） |
 * | 2 | pending custom + mode curated             | （无等价；TS 独有，调用 cancelReview） |
 * | 3 | alt_engine_corpus + engine === 'qwen'     | L93–100: Qwen 退出 alt_engine        |
 * | 4 | alt_engine_corpus：缺文件→curated；否则保持并清 stuck session 后 return | 缺文件→curated；否则保持并可清 stuck | A1/A4 **已统一** |
 * | 5 | custom_corpus 无效 → curated + 重置官方     | invalid custom_corpus                |
 * | 6 | custom_corpus + official + useCurated     | official + use_curated               |
 * | 7 | curated + official + !useCurated + ready  | 切到 custom_corpus                   |
 * | 8 | 清理 stuck session（非 review/restart）   | _should_clear_stuck_session          |
 *
 * 已知不对称（CONTRACT.md §已知不对称，有意保留·待决策统一）：
 * - A1 **已统一（跟 Python）**：缺 corpus.custom.json → curated
 * - A2 **永久分工**：TS #5 可删 orphan / 重置 forge；Python 仅 mode / session，永不删盘
 * - A3 **永久分工**：TS #1/#2 cancelVoiceForgeReview；Python 不做产品级取消
 * - A4 **已统一（跟 Python）**：保持 alt 时仍清 stuck session
 * - A5 **已统一（reconcile）**：#5 用 sampleReadyForTts（wav+txt）；列表仍用 sampleHasReference（仅 wav）
 * - A6 **已统一（① 跟 Electron）**：#7 升 custom 须 touch_cache ready
 * - A7 **已统一（③）**：stuck session 双端同一张表（见 stuckSessionPolicy / CONTRACT §A7）
 */

import { existsSync, rmSync } from 'fs'

import { readConfiguredTtsEngine } from '../ttsEngineInfo'
import { clearVoiceForgeSession, readVoiceForgeSession } from './internal/session-io'
import { defaultSampleDir, sampleDirForId, voiceForgeSessionFile, customCorpusFile } from './paths'
import { cancelVoiceForgeReview } from './domains/voice-flow'
import { shouldClearStuckSession } from './stuckSessionPolicy'
import {
  isOfficialSampleProfile,
  isOfficialTouchCacheReady,
  readOfficialUseCuratedClips,
  readVoiceForgeConfig,
  readVoiceForgeJson,
  writeVoiceForgeConfig
} from './domains/voice-forge'
import { sampleReadyForTts } from './internal/sample-utils'
import { readTouchConfig, writeTouchConfig } from './domains/touch'
import type { TouchFeedbackMode } from './types/runtime-config'
import { OFFICIAL_SAMPLE_ID, OFFICIAL_SAMPLE_LABEL } from './types/runtime-config'

function activeSampleReadyForSession(activeSample: { folderId?: string } | null | undefined): boolean {
  const folderId = activeSample?.folderId?.trim() ?? ''
  const sampleDir = folderId ? sampleDirForId(folderId) : defaultSampleDir()
  return sampleReadyForTts(sampleDir)
}

/** 修复触摸模式与激活声线不一致及中断的会话。 */
export function reconcileVoiceRuntimeConfig(): TouchFeedbackMode {
  const { corpus } = readTouchConfig()
  let { mode, instruct, activeSample } = readVoiceForgeConfig()
  const data = readVoiceForgeJson()

  if (existsSync(voiceForgeSessionFile())) {
    const session = readVoiceForgeSession()
    if (session === null) {
      clearVoiceForgeSession()
    } else if (session.flow === 'create_voice' && session.phase === 'cancelled') {
      // ── TS #1：cancelled session ────────────────────────────────
      return cancelVoiceForgeReview().touchMode
    }
  }

  const session = readVoiceForgeSession()

  // ── TS #2：pending custom + curated ───────────────────────────
  if (
    activeSample &&
    !isOfficialSampleProfile(activeSample) &&
    activeSample.pending === true &&
    mode === 'curated'
  ) {
    return cancelVoiceForgeReview().touchMode
  }

  // ── #3 / #4：alt_engine_corpus ─────────────────────────────────
  if (mode === 'alt_engine_corpus' && readConfiguredTtsEngine() === 'qwen') {
    writeTouchConfig('curated', corpus)
    return 'curated'
  }
  if (mode === 'alt_engine_corpus') {
    // A1 已统一（跟 Python）：缺 corpus.custom.json 则退回精选
    if (!existsSync(customCorpusFile())) {
      writeTouchConfig('curated', corpus)
      return 'curated'
    }
    // A4 已统一：保持 alt 时仍清卡住的工坊 session
    if (
      shouldClearStuckSession({
        flow: session?.flow,
        phase: session?.phase,
        sampleReady: activeSampleReadyForSession(activeSample)
      })
    ) {
      clearVoiceForgeSession()
    }
    return mode
  }

  // ── #5 / #6：custom_corpus ─────────────────────────────────────
  if (mode === 'custom_corpus') {
    const folderId = activeSample?.folderId?.trim() ?? ''
    const sampleDir = folderId ? sampleDirForId(folderId) : defaultSampleDir()
    const referenceReady = sampleReadyForTts(sampleDir)

    if (!folderId || !referenceReady) {
      mode = 'curated'
      writeTouchConfig('curated', corpus)
      if (folderId && folderId !== OFFICIAL_SAMPLE_ID) {
        const orphanDir = sampleDirForId(folderId)
        if (existsSync(orphanDir)) {
          rmSync(orphanDir, { recursive: true, force: true })
        }
      }
      writeVoiceForgeConfig(
        'curated',
        corpus,
        instruct,
        {
          folderId: OFFICIAL_SAMPLE_ID,
          displayName: OFFICIAL_SAMPLE_LABEL,
          kind: 'official',
          pending: false
        },
        { officialUseCuratedClips: true }
      )
      clearVoiceForgeSession()
      return mode
    }

    if (isOfficialSampleProfile(activeSample) && readOfficialUseCuratedClips(data)) {
      mode = 'curated'
      writeTouchConfig('curated', corpus)
      writeVoiceForgeConfig('curated', corpus, instruct, activeSample, { officialUseCuratedClips: true })
      return mode
    }

    return mode
  }

  // ── #7：curated → custom_corpus 升级 ───────────────────────────
  if (isOfficialSampleProfile(activeSample) && !readOfficialUseCuratedClips(data)) {
    if (isOfficialTouchCacheReady()) {
      mode = 'custom_corpus'
      writeTouchConfig('custom_corpus', corpus)
    }
    return mode
  }

  // ── #8：清理 stuck session（与 Python 同一张表）────────────────
  if (
    shouldClearStuckSession({
      flow: session?.flow,
      phase: session?.phase,
      sampleReady: activeSampleReadyForSession(activeSample)
    })
  ) {
    clearVoiceForgeSession()
  }

  return mode
}
