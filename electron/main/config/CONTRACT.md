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
| 1 | `phase === 'cancelled'` → `cancelVoiceForgeReview()` | 无（不执行产品级取消） | **A3 永久分工** |
| 2 | `pending` 自定义声线 + `curated` → `cancelVoiceForgeReview()` | 无 | **A3 永久分工** |
| 3 | `alt_engine_corpus` + Qwen → `curated` | L93–100 | 一致 |
| 4 | `alt_engine_corpus` 非 Qwen：缺文件 → curated；否则保持 mode，并按 #8 清 stuck session | 同：缺文件 → curated；否则保持并可清 stuck | **A1/A4 已统一** |
| 5 | 无效 `custom_corpus` → curated + **Electron 可删孤儿目录/重置 forge**；就绪谓词 **wav+txt** | 仅改 touch mode + 条件清 session；就绪谓词 **wav+txt**；**不删盘、不改 forge** | **A5 已统一（就绪）**；**A2 永久分工（删盘）** |
| 6 | 官方 + `officialUseCuratedClips` → `curated` | L123–129 | 一致 |
| 7 | curated + 官方 + `!useCurated` + **`isOfficialTouchCacheReady()`** → `custom_corpus` | 同：另需 **`is_touch_cache_ready`**（与 Electron 对齐） | **A6 已统一** |
| 8 | stuck session：见下方真相表 | 同左 | **A7 已统一** |

### 已知不对称 / 分工

> **标记说明：**  
> - **待统一**：业务语义待维护者拍板后再改一端。  
> - **永久产品分工**：两端职责不同，**不是**要消掉的漂移；改代码时须遵守，禁止为「对称」让 TTS 做 Electron 的破坏性清理（或反之未经决策互换）。  
> Python 单测见 `tts_voice/tests/test_reconcile.py`，用例注释引用下方编号（A1–A7）。

| ID | 主题 | Electron (TS) | Python | 有意保留说明 / 根因 |
|----|------|---------------|--------|---------------------|
| **A1** | alt 语料文件缺失 | 缺 `corpus.custom.json` → `curated` | 同左 | **已统一（跟 Python）**：两端缺文件都退精选。Electron：`reconcile.ts` #4；Python：原有行为。 |
| **A2** | 无效 custom 的破坏性清理 | `#5` 回退 curated 时：可 `rmSync` 孤儿样本目录 + 重置官方 forge + 清 session | 仅 `write_touch_mode("curated")`，可选清 session；**永不**删样本目录、**不重写** `voice-forge.json` activeSample | **永久产品分工**：破坏性清理只在 Electron；TTS 进程禁止替用户删盘。不是「待统一的漂移」。 |
| **A3** | cancelled / pending 会话 | `#1`/`#2` → `cancelVoiceForgeReview()` 全量恢复 | 无 `cancelled` / pending+curated 分支；不清「取消」语义 | **永久产品分工**：取消工坊 / 审阅恢复只在 Electron；Python 不把 session 当产品取消按钮。不是「待统一的漂移」。 |
| **A4** | alt 保持后的 session 清理 | 保持 alt 时按 #8 清 stuck session | 同左 | **已统一**：alt 下也会跑 #8；具体清哪些 phase 见下方 **卡住 session 清理真相表**。 |
| **A5** | 「样本就绪」判定（reconcile #5） | `#5` 用 `sampleReadyForTts`（wav+txt）；列表/切换仍用 `sampleHasReference`（仅 wav） | `_active_sample_ready`（wav+txt） | **已统一**：修盘是否有效自定义与 Python 一致。展示「有没有参考音」仍可只看 wav。#7 升级门槛仍见 **A6**（cache vs reference）。 |
| **A6** | `#7` curated→custom 升级门槛 | `isOfficialTouchCacheReady()`（pointer `ready` 或 touch_cache manifest+`0.wav`） | `_active_sample_ready()` **且** `is_touch_cache_ready()` | **已统一（跟 Electron）**：关精选后须预热缓存可用再升 `custom_corpus`，避免一点击就全走实时推理。 |
| **A7** | stuck session 清理 | 见下方 **卡住 session 清理真相表** | 同左 | **已统一**：两端同一张表；`cancelled` 仍由 A3（Electron #1）做产品取消，#8 不清 cancelled。 |

### A1–A7 测试覆盖对照

> 改规则前对表；**永久分工**项禁止为「对称」改产品语义。发现漂移：**先改本 CONTRACT，再双端改代码**。

| ID | 状态 | Electron 测 | Python 测 | 备注 |
|----|------|-------------|-----------|------|
| A1 | 已统一 | `reconcileA1.test.ts` | `test_alt_engine_missing_corpus_…` | 缺 corpus → curated |
| A2 | **永久分工** | （Electron #5 删盘路径有意不对称；勿强求 Python 对称测） | `test_invalid_custom_does_not_delete_…` | 锁「Python 不删盘」 |
| A3 | **永久分工** | （#1/#2 取消工坊在 Electron 产品路径） | `test_cancelled_session_is_ignored_by_python` | 锁「Python 不做产品取消」 |
| A4 | 已统一 | `reconcileA4.test.ts` | `test_alt_engine_keep_still_clears_…` | 保持 alt 仍清 stuck |
| A5 | 已统一 | `reconcileA5.test.ts` + `sampleReadyForTts.test.ts` | `test_custom_corpus_wav_only_…` | wav+txt |
| A6 | 已统一 | `reconcileA6.test.ts` | `test_curated_without/with_touch_cache_…` | #7 升级须 cache ready |
| A7 | 已统一 | `stuckSessionPolicy.test.ts` | `test_a7_unified_stuck_session_matrix` | 同一张 phase 表 |

### 卡住 session 清理真相表（双端同一张，与 mode 无关）

前提：仅当 `flow === create_voice`。「清」= 删 `voice-forge-session.json` / `clear_session`。  
`样本就绪` = wav+txt（与 A5 一致）。

| phase | 清？ |
|-------|------|
| `awaiting_review` | 否（待审保留） |
| `cancelled` | 否（交给 A3；Electron #1 另做取消工坊） |
| `completed` | 否 |
| `prewarming` | **是** |
| `pending_restart` / `generating` | 样本**未**就绪才清；齐了则保留 |
| 其它未知 phase | **是**（当卡住） |

实现：`stuckSessionPolicy.shouldClearStuckSession` ↔ `voice_runtime_repair._should_clear_stuck_session`。

---

## 人话说明：两边修盘在干什么

一句话：**磁盘上的触摸模式 / 声线 / 工坊会话，Electron 启动时修一次，Python 在加载和切模式时修得更勤；多数规则已对齐，少数是永久产品分工（A2/A3）。**

| 谁 | 何时跑 reconcile |
|----|------------------|
| Electron | 基本只在应用启动 |
| Python | 加载模型、`/touch-mode/sync`、预热前后等 |

| 文件 | 常见谁写 |
|------|----------|
| `touch-mode.env` | UI/`writeTouchConfig`；两端 reconcile 都可能改 |
| `voice-forge.json` | Electron 工坊/切声线；Python reconcile **通常不重写** activeSample（无效 custom 时见 A2） |
| `voice-forge-session.json` | 工坊流程；两端按同一张卡住 session 表清理 |
| `experimental-voice-upload.json` | 仅 Electron；Python 不读 |

改规则前：先改本 CONTRACT → 再 **只改一端** → 跑 `test:tts` 与（若动 TS 策略）`stuckSessionPolicy` vitest → 人工切触摸模式/换引擎/重启对照。

---

## 写序约束

`writeVoiceForgeConfig` 必须先写 `voice-forge.json`（含 `officialUseCuratedClips`），再写 `touch-mode.env`，避免 TTS reconcile 读到 `custom_corpus` + `officialUseCuratedClips=true` 的中间态。
