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
| 1 | `phase === 'cancelled'` → `cancelVoiceForgeReview()` | 无 | 见不对称 A3 |
| 2 | `pending` 自定义声线 + `curated` → `cancelVoiceForgeReview()` | 无 | 见不对称 A3 |
| 3 | `alt_engine_corpus` + Qwen → `curated` | L93–100 | 一致 |
| 4 | `alt_engine_corpus` 非 Qwen → 保持 mode（early `return`） | L93–109 后继续可进 #8 session 清理；缺 corpus 另见 A1 | 见不对称 A1 / A4 |
| 5 | 无效 `custom_corpus` → curated + 重置官方 + 可能 `rmSync` orphan | L111–121：仅 `write_touch_mode` + 条件 `clear_session` | 见不对称 A2 / A5 |
| 6 | 官方 + `officialUseCuratedClips` → `curated` | L123–129 | 一致 |
| 7 | curated + 官方 + `!useCurated` + **`isOfficialTouchCacheReady()`** → `custom_corpus` | curated + 官方 + `!useCurated` + **`_active_sample_ready()`** → `custom_corpus` | 见不对称 A6（谓词不同，勿当成「一致」） |
| 8 | stuck session：非 `awaiting_review`/`pending_restart` 即清 | `_should_clear_stuck_session`（按 mode 分支） | 见不对称 A4 / A7 |

### 已知不对称（有意保留 · 业务语义待后续决策统一）

> **标记说明：** 下列差异均为 **「有意保留，业务语义待后续决策统一」**，**不是**「已确认永久差异」。  
> 在维护者明确统一策略前，禁止「只改一端让两边碰巧对齐」而不改本文档。  
> Python 单测见 `tts_voice/tests/test_reconcile.py`，用例注释引用下方编号（A1–A7）。

| ID | 主题 | Electron (TS) | Python | 有意保留说明 / 根因 |
|----|------|---------------|--------|---------------------|
| **A1** | alt 语料文件缺失 | `#4` 非 Qwen 时直接 `return mode`，**不**检查 `corpus.custom.json` | `CUSTOM_CORPUS_PATH` 不存在 → `write_touch_mode("curated")` | **有意保留，业务语义待后续决策统一。** 根因倾向：Python 为 TTS 运行时守护（无语料文件则无法走第三方预热）；TS reconcile 假定语料由 UI/`writeTouchConfig` 写入，缺失交由 TTS 启动/sync 路径补。是否统一到「两端都回退」待决策。 |
| **A2** | 无效 custom 的破坏性清理 | `#5` 回退 curated 时：`rmSync` 孤儿 `custom_sample/{id}` + `writeVoiceForgeConfig` 重置官方 + `clearVoiceForgeSession` | 仅 `write_touch_mode("curated")`，可选 `clear_session()`；**不删**样本目录、**不重写** `voice-forge.json` activeSample | **有意保留，业务语义待后续决策统一。** 根因倾向：Electron 启动态负责「用户可见配置」纠偏与删半成品声线；Python 侧避免 TTS 进程误删用户样本目录。是否让 Python 同步销毁磁盘待决策。 |
| **A3** | cancelled / pending 会话 | `#1`/`#2` → `cancelVoiceForgeReview()` 全量恢复 | 无 `cancelled` / pending+curated 分支 | **有意保留，业务语义待后续决策统一。** 根因倾向：取消审阅流程绑定 Electron UI/`voice-flow`；Python 会话文件多作跨重启提示，不执行产品级「取消工坊」副作用。 |
| **A4** | alt 保持后的 session 清理 | `#4` early `return`，**跳过** `#8` | alt 保持后仍可进入 `_should_clear_stuck_session`（如 `prewarming` 会清） | **有意保留，业务语义待后续决策统一。** 根因倾向：TS 把 alt 视为「非音色工坊链路」并早退；Python sync 频率高，需清卡住的 create_voice 预热会话。是否让 TS 在 alt 下也清 session 待决策。 |
| **A5** | 「样本就绪」判定（#5 无效与 #7 升级共用相关谓词） | `sampleHasReference` = 仅 `reference.wav`（`sample-utils.ts`） | `_active_sample_ready` = `reference.wav` **且** `reference.txt` | **有意保留，业务语义待后续决策统一。** **根因（代码职责推断）：** Electron 多处用 wav 是否存在表示「声线目录已有参考音可列出/切换」；Python 克隆/推理路径需要文本对齐（`sample_paths` 同时交出 wav+txt），故 TTS reconcile 要求双文件。仅有 wav、无 txt 时：TS 可能认为有效，Python `#5` 判无效并回退 curated。是否统一谓词待决策。 |
| **A6** | `#7` curated→custom 升级门槛 | `isOfficialTouchCacheReady()`（pointer `ready` 或 touch_cache manifest+`0.wav`） | `_active_sample_ready()`（wav+txt，**不**要求 touch_cache） | **有意保留，业务语义待后续决策统一。** **根因（代码职责推断）：** Electron 桌宠播放路径在关掉精选后希望「预热缓存已可用」再切 `custom_corpus`，避免一点击就全走实时推理；Python 作为 TTS 服务在用户关闭 `officialUseCuratedClips` 且参考音齐备时尽早切 mode，以便后续 sync/prewarm **去建** cache。同盘「有 reference、无 touch_cache」时：Python 可升到 `custom_corpus`，Electron 可能仍留在 `curated`。 |
| **A7** | stuck session 清理策略细节 | `create_voice` 且 phase 非 review/restart → 清 | curated 下对 restart/generating 看参考音是否就绪等（见 `_should_clear_stuck_session`） | **有意保留，业务语义待后续决策统一。** 根因待查处可并存：矩阵分支在双端独立演化；完整真相表尚未 Formalize。暂不强制对齐。 |

**其它小差异（同样有意保留，业务语义待后续决策统一）：**

- Python `normalize_touch_mode` 支持更多别名（如 `third_party` → `alt_engine_corpus`）；TS `normalizeTouchMode` 别名集更小。  
- Python 可读环境变量 `TOUCH_MODE`；Electron reconcile 不读。  
- 官方 folderId 别名：Python `_OFFICIAL_FOLDER_IDS` 含 `default` / `official`；TS 侧以 `kind==='official'` / `OFFICIAL_SAMPLE_ID` 为主。

## 写序约束

`writeVoiceForgeConfig` 必须先写 `voice-forge.json`（含 `officialUseCuratedClips`），再写 `touch-mode.env`，避免 TTS reconcile 读到 `custom_corpus` + `officialUseCuratedClips=true` 的中间态。
