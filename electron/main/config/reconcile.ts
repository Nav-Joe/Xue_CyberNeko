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
 * | 4 | alt_engine_corpus 保持                    | L93–109: 非 Qwen 且 corpus 存在      |
 * | 5 | custom_corpus 无效 → curated + 重置官方     | L111–121: invalid custom_corpus      |
 * | 6 | custom_corpus + official + useCurated     | L123–129: official + use_curated     |
 * | 7 | curated + official + !useCurated + ready  | L131–137: 切到 custom_corpus         |
 * | 8 | 清理 stuck session（非 review/restart）   | L139–141: _should_clear_stuck_session|
 *
 * 已知不对称（CONTRACT.md §Reconcile 详述）：
 * - Python L103–109：alt_engine 语料文件缺失 → curated（TS reconcile 未覆盖，TTS 启动时补）
 * - TS #5 会删除 orphan sample 目录；Python 仅 write_touch_mode + clear_session
 * - TS #1/#2 走 cancelVoiceForgeReview 全量恢复；Python 无 cancelled phase 分支
 */

import { existsSync, rmSync } from 'fs'

import { readConfiguredTtsEngine } from '../ttsEngineInfo'
import { clearVoiceForgeSession, readVoiceForgeSession } from './internal/session-io'
import { defaultSampleDir, sampleDirForId, voiceForgeSessionFile } from './paths'
import { cancelVoiceForgeReview } from './domains/voice-flow'
import {
  isOfficialSampleProfile,
  isOfficialTouchCacheReady,
  readOfficialUseCuratedClips,
  readVoiceForgeConfig,
  readVoiceForgeJson,
  sampleHasReference,
  writeVoiceForgeConfig
} from './domains/voice-forge'
import { readTouchConfig, writeTouchConfig } from './domains/touch'
import type { TouchFeedbackMode } from './types/runtime-config'
import { OFFICIAL_SAMPLE_ID, OFFICIAL_SAMPLE_LABEL } from './types/runtime-config'

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
    return mode
  }

  // ── #5 / #6：custom_corpus ─────────────────────────────────────
  if (mode === 'custom_corpus') {
    const folderId = activeSample?.folderId?.trim() ?? ''
    const sampleDir = folderId ? sampleDirForId(folderId) : defaultSampleDir()
    const referenceReady = sampleHasReference(sampleDir)

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

  // ── #8：清理 stuck session ─────────────────────────────────────
  if (session?.flow === 'create_voice') {
    const keep = session.phase === 'awaiting_review' || session.phase === 'pending_restart'
    if (!keep) {
      clearVoiceForgeSession()
    }
  }

  return mode
}
