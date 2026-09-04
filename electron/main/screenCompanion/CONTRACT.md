# screenCompanion — CONTRACT（M6.1–M6.5）

> **位置：** `electron/main/screenCompanion/`  
> **阶梯：** 门闩 → 观察 → 调度 → 退会话 → 旁白+TTS → 设置 UI + 聊天锁（M6.5）→ **陪玩记忆（M6.6）**

## 边界

- **允许：** 上文全部能力；聊天设置页配置总闸/间隔/暂停/黑名单/视觉 API；**在玩会话锁聊天**（系统 dialog）；TTS 关时自动关 companion + 设置内提示；**`memoryEnabled` 时** JSONL 记录旁白+observe 摘要，**退陪玩会话**异步总结进 `session_summaries`（`source=companion`），参与周/月滚  
- **禁止：** 旁白进聊天历史；**原图/识图全量 JSON** 进记忆；聊天气泡；verify 脚本作主验收路径  
- **TTS 绑定：** `enabled=true` 须 chat TTS 开；关 TTS 时 renderer 自动 `enabled=false` 并提示  
- **旁白 LLM：** 继承 chat-config（M6.5 不提供单独文本 LLM 表单）  
- **旁白 TTS：** `src/services/screenCompanion/companionTtsPipeline.ts` + **`splitTextForCompanionTts`**（与聊天 `splitTextForTts` **禁止混用**）；`parallel_lanes` 固定 0（串行）

## 调度（摘要）

TTS 播完 → 计 `intervalSec` → 仍在玩 → observe → narrate → pet TTS → 循环。leave 不关总闸。

## 配置（`screen-companion-config.json`）

| 字段 | 说明 |
|------|------|
| `enabled` | 总闸 |
| `intervalSec` | 30–600，默认 90 |
| `pausedUntilMs` | 暂停看屏 |
| `processBlacklist` | 进程名 contains |
| `vision.*` | 独立视觉 API（URL / model / Key） |
| `visionApiKeySecretSave` | 默认关；开则 View 不回传明文 Key（与聊天 `openaiApiKeySecretSave` 同口径） |
| `companionTtsDevice` | 旁白 TTS：`cpu`（默认）/ `gpu` |

## 视觉摘要长度约定

单一真相源：`visionLimits.ts`（改数字先改文件，再对表）。

| 常量 | 当前值 | 作用 |
|------|--------|------|
| `VISION_SUMMARY_TARGET_CHARS` | 100 | 提示词软目标（「约 N 字以内」） |
| `VISION_SUMMARY_MAX_CHARS` | 300 | **识图摘要**硬截断（不截旁白 LLM 输出） |
| `VISION_SUMMARY_MAX_TOKENS` | 400 | API `max_tokens`，需能覆盖硬截断量级 |
| `VISION_SUMMARY_TEMPERATURE` | 0.2 | 识图温度 |
| `VISION_IMAGE_DETAIL` | `low` | 缩略图低细节 |

## IPC

| Channel | 说明 |
|---------|------|
| `screen-companion-*` | 既有 read/write/status/session/narrate |
| `show-info-dialog` | 聊天锁弹窗（单按钮） |

## UI（M6.5）

- 位置：聊天设置 → **屏幕感知**（在对话 TTS 下方）
- 状态条：`sessionActive` / `playingGameName` / `nextObserveAtMs` / 视觉是否配全
- 聊天锁：`sessionActive` 时拦截发送 + `show-info-dialog`

## 总闸 × 会话 × 聊天锁 × 截屏

> 语义锁：关总闸 = **零截屏**；在玩会话 = **锁聊天发送**。总闸开着但未进会话时，仍可正常聊天（不锁）。

| `enabled` | `sessionActive` | 调度 | 截屏 / observe | 聊天发送 |
|-----------|-----------------|------|----------------|----------|
| `false` | （应为空） | `stop` / 不 start | **禁止**（`privacy`/`capture`/`runCycleTick` 均门闩） | 允许 |
| `true` | `false` | 可 running（hunt / 等进程） | 无会话则不 observe | 允许 |
| `true` | `true` | 周期 tick → observe → narrate → TTS | 允许（仍过 pause/黑名单） | **拦截** + `show-info-dialog` |

**关总闸路径（须同时成立）：**

1. `reconcileScreenCompanionScheduler` 或 `runCycleTick` 读到 `enabled=false`（或聊天 TTS 关）→ `stopScreenCompanionScheduler`  
2. stop → `leaveSession` → 发 `sessionActive=false`（解聊天锁）  
3. 之后任意 tick / observe **不得**再调 `observePrimaryScreen` / capturer  

**不在本表：** STT 是否绕过发送锁（若有入口，应与发送同拦；本轮不改 STT）；TTS 并行 lanes 语义另见 chat / tts_voice CONTRACT。

## 人工验收（主路径）

`启动.bat` 本体：配视觉 → 开 TTS → 开屏幕感知 → **开记忆** → 玩游戏听旁白 → 关游戏 → 记忆空间 L2 出现「陪玩总结」→ 聊天锁恢复。

## M6.6 陪玩记忆

| 项 | 说明 |
|----|------|
| 容器 | `{userData}/screen-companion-memory/{companionSessionId}.jsonl` |
| 记录 | `kind=narrate`（旁白 LLM 输出）、`kind=observe`（屏幕摘要文字） |
| 总闸 | 仅 `memoryEnabled=true` 时 append；关则零写入 |
| 触发 | `leaveSession`（关游戏/退会话）→ **`scheduleCompanionMemoryConsolidate`（fire-and-forget）** → 后台 `runOnConsolidateChain` |
| 落库 | `session_summaries`，`source=companion`，`source_label=游戏名` |
| 滚总结 | 成功后 `maybeRunPeriodRollups`（与聊天 L2 同源；亦不阻塞 leave） |
| 失败 | LLM 失败保留 JSONL，下次 leave 可重试 |
| 与关窗 | 与聊天关窗总结**共用** `consolidateChain`：leave 本身不 await；若关窗时陪玩总结仍在跑，关窗 finalize 会在链上排队等待（再开聊有超时兜底） |
