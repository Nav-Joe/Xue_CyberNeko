# Runtime Config 双端契约

Electron 主进程（`electron/main/config/`）与 Python TTS（`tts_voice/`）通过 `.runtime/` 与 `voice_forge/` 下的文件交换状态。修改任一侧读写逻辑时，请同步更新本文档。

## 磁盘文件契约

| 文件（相对项目根） | 格式 | TS 读写 | Python 读写 | 字段 / 说明 |
|---|---|---|---|---|
| `.runtime/touch-mode.env` | 单行 mode | `domains/touch.ts` → `writeTouchConfig` | `touch_mode_config.py` → `read_touch_mode` / `write_touch_mode` | `curated` \| `custom_corpus` \| `alt_engine_corpus`；Python 另支持 `TOUCH_MODE` 环境变量及别名归一化 |
| `.runtime/corpus.custom.json` | JSON | `writeTouchConfig` | `touch_mode_config.CUSTOM_CORPUS_PATH` | 与 `src/types/corpus` / `CorpusData` 结构一致 |
| `.runtime/voice-forge.json` | JSON | `domains/voice-forge.ts` | `voice_forge_paths.read_voice_forge_config` | `instruct?`, `activeSample?`, `officialUseCuratedClips?` |
| `.runtime/voice-forge-session.json` | JSON | `internal/session-io.ts` | `voice_forge_session.read_session` | 见 §Session |
| `.runtime/corpus-prewarm.flag` | 单行 folderId | `internal/flags-io.ts` → `markCorpusPrewarmPending` | `voice_forge_paths.consume_corpus_prewarm_flag` | 声线 `folderId` 或 `__alt_engine__` |
| `.runtime/realtime-inference.env` | 单行 `1` | `internal/flags-io.ts` | `voice_forge_paths.read_realtime_inference_enabled` | 存在且为 `1` 表示开启 |
| `.runtime/regenerate-voice-model.flag` | 单行 `1` | `domains/voice-flow.ts` | `voice_forge_paths.REGEN_FLAG` | 仅 flag 存在性 |
| `.runtime/experimental-voice-upload.json` | JSON `{ enabled: bool }` | `domains/experimental.ts` | **Python 不读** | Electron / 前端实验开关 |

### voice-forge.json → activeSample

| 字段 | TS 类型 | Python | 说明 |
|---|---|---|---|
| `folderId` | `string` | `dict["folderId"]` | 官方为 `default_sample` |
| `displayName` | `string` | `dict["displayName"]` | 展示名 |
| `kind` | `'official' \| 'custom'` | `dict["kind"]` | 可选 |
| `pending` | `boolean` | （Python 不单独校验） | 创建流程中未完成 |

### 语料快照

| 路径 | 说明 |
|---|---|
| `voice_forge/default_sample/corpus.snapshot.json` | 官方声线语料 |
| `voice_forge/custom_sample/{id}/corpus.snapshot.json` | 自定义声线语料 |
| `voice_forge/other_custom_cache/{engine}/corpus.snapshot.json` | 第三方引擎语料（`alt_engine_corpus`） |

## Session phase 枚举

与 `tts_voice/voice_forge_session.py` 常量一一对应；TS 在 `internal/session-io.ts` 解析时拒绝未知 phase。

| phase | Python 常量 |
|---|---|
| `pending_restart` | `PHASE_PENDING_RESTART` |
| `generating` | `PHASE_GENERATING` |
| `awaiting_review` | `PHASE_AWAITING_REVIEW` |
| `prewarming` | `PHASE_PREWARMING` |
| `completed` | `PHASE_COMPLETED` |
| `cancelled` | `PHASE_CANCELLED` |

`flow` 当前仅 `create_voice`（或 JSON 中 `null`）。

## Reconcile 规则对照

TS：`config/reconcile.ts` → `reconcileVoiceRuntimeConfig()`  
Python：`voice_runtime_repair.py` → `reconcile_runtime_voice_config()`

| # | TS | Python | 备注 |
|---|---|---|---|
| 1 | `phase === 'cancelled'` → `cancelVoiceForgeReview()` | 无 | TS 独有 |
| 2 | `pending` 自定义声线 + `curated` → `cancelVoiceForgeReview()` | 无 | TS 独有 |
| 3 | `alt_engine_corpus` + Qwen → `curated` | L93–100 | 一致 |
| 4 | `alt_engine_corpus` 保持 | L93–109（非 Qwen 且 corpus 文件存在） | 见不对称 §1 |
| 5 | 无效 `custom_corpus` → `curated` + 官方默认 | L111–121 | 见不对称 §2 |
| 6 | 官方 + `officialUseCuratedClips` → `curated` | L123–129 | 一致 |
| 7 | 官方 + 非精选 + cache ready → `custom_corpus` | L131–137 | 一致 |
| 8 | 清理 stuck session | L139–141 `_should_clear_stuck_session` | 逻辑相近，实现细节不同 |

### 已知不对称

1. **alt_engine 语料缺失**：Python L103–109 在 `corpus.custom.json` 缺失时回退 `curated`；TS `reconcile.ts` 不在此处理，由 TTS 启动路径补全。
2. **orphan 样本目录**：TS #5 在无效 `custom_corpus` 时会 `rmSync` 孤儿声线目录；Python 仅 `write_touch_mode("curated")` 与可选 `clear_session()`。
3. **cancelled / pending 清理**：TS #1/#2 调用 `cancelVoiceForgeReview()` 全量恢复官方配置；Python 无 `cancelled` phase 分支。

## 写序约束

`writeVoiceForgeConfig` 必须先写 `voice-forge.json`（含 `officialUseCuratedClips`），再写 `touch-mode.env`，避免 TTS reconcile 读到 `custom_corpus` + `officialUseCuratedClips=true` 的中间态。
