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

## IPC

| Channel | 说明 |
|---------|------|
| `screen-companion-*` | 既有 read/write/status/session/narrate |
| `show-info-dialog` | 聊天锁弹窗（单按钮） |

## UI（M6.5）

- 位置：聊天设置 → **屏幕感知**（在对话 TTS 下方）
- 状态条：`sessionActive` / `playingGameName` / `nextObserveAtMs` / 视觉是否配全
- 聊天锁：`sessionActive` 时拦截发送 + `show-info-dialog`

## 人工验收（主路径）

`启动.bat` 本体：配视觉 → 开 TTS → 开屏幕感知 → **开记忆** → 玩游戏听旁白 → 关游戏 → 记忆空间 L2 出现「陪玩总结」→ 聊天锁恢复。

## M6.6 陪玩记忆

| 项 | 说明 |
|----|------|
| 容器 | `{userData}/screen-companion-memory/{companionSessionId}.jsonl` |
| 记录 | `kind=narrate`（旁白 LLM 输出）、`kind=observe`（屏幕摘要文字） |
| 总闸 | 仅 `memoryEnabled=true` 时 append；关则零写入 |
| 触发 | `leaveSession`（关游戏/退会话）；后台 `runOnConsolidateChain` |
| 落库 | `session_summaries`，`source=companion`，`source_label=游戏名` |
| 滚总结 | 成功后 `maybeRunPeriodRollups`（与聊天 L2 同源） |
| 失败 | LLM 失败保留 JSONL，下次 leave 可重试 |
