# Memory（Electron main）— CONTRACT

> M4 记忆基座。仅主进程写 SQLite；渲染进程经 IPC 读。

## 边界

- **拥库：** `electron/main/memory/` + `{userData}/memory.db`
- **禁止：** 手写 `CREATE TABLE` / `ensureSchema()`；Python 直接打开该 DB；记忆逻辑进 `tts_voice/`
- **迁移：** 表结构只经 Drizzle schema → `drizzle-kit generate` → 启动时 `migrate()`（或 CLI `drizzle-kit migrate`）

## 公开入口

| 符号 | 用途 |
|------|------|
| `schema.ts` | 表定义（权威） |
| `migrations/` | generate 产物（须入库） |
| `dbCore.openMemoryDbAt` | 打开 + `migrate()`（无 Electron） |
| `openMemoryDb()` | 主进程默认路径打开 + 迁移 |
| `resolveMemoryDbPath()` | 运行时 DB 路径 |

## 变更规则

- 改表：先改 `schema.ts`，再 `npm run db:generate`，提交 SQL + meta；禁止只改运行时 DDL
- M4.2 / 4.3 / 4.5 一律追加迁移，不覆盖历史 SQL
- **原生模块：** `better-sqlite3` 须按 **Electron ABI** 编译（`npm run rebuild:native` / postinstall）。系统 Node 与 Electron 的 `NODE_MODULE_VERSION` 不同时会出现 init failed；此时记忆不可用，其它功能仍可跑。
- **记忆库集成测：** `npm run test:memory` — 临时按系统 Node 重编 → `REQUIRE_MEMORY_DB=1` 跑 `electron/main/memory/__tests__`（ABI 不可用则硬失败，禁止静默 skip）→ 再恢复 Electron ABI。普通 `npm test` 在 ABI 不对齐时仍会 skip DB 用例。

## IPC（M4.1）

| Channel | 说明 |
|---------|------|
| `memory-get-status` | ready + flags |
| `memory-append-raw-log` | 写 raw_logs（受 `memoryEnabled`） |
| `memory-get-recent-history` | 按 timestamp 从新往旧取最近 N 轮对话（`maxRounds`）；切轮复用 `historyWindow.trimHistoryToRounds`；关记忆 / DB 不可用 → `ok:false` |
| `memory-get-prompt-context` | L1 核心必带；用户画像非空则 100% 注入（不占总结预算）；L3 用本轮输入对 `session_summaries` + `period_summaries` 的 `key_facts`/`keywords`（同套连续串+滑窗）+ `summary` 弱匹配类 RAG；主序 `score=relevance×significance×decay`；零命中且含回忆触发词时保底 1～2 条；注入 key_facts，总结区粗估受模式预算 |
| `memory-list-timeline` | 只读时间线：L1=核心池（含活力 weight）· L2=日常会话总结 · L3=周/月 period（两大类）；**不含** `memory_events` |
| `memory-record-peek` | 打开记忆空间：写入待消费 peek 事件（时间戳） |
| `memory-consume-pending-peeks` | 下一轮发消息前消费：返回拼到 LLM **user** 前缀的文本并删除事件；UI 不展示 |
| `memory-notify-chat-closed` | 触发异步整理 |
| `memory-maybe-mid-session-consolidate` | 本轮结束后：全局 raw 轮数达软上限则日常总结并裁窗口（OpenAI 50→30 / 本地 20→10）；关窗总结不变 |
| `memory-maybe-period-rollup` | 异步周/月滚总结（数月短路→周→月；**含陪玩 L2**）；**月成功后**尝试更新 `user_profile`；失败不删源 |

启动：`initMemorySubsystem()` → `openMemoryDb()` + `migrate()`。  
关窗：**延迟整理** — `onChatWindowClosed` → `runConsolidateThenStopLlama`（先总结并**累积**写入 `session_summaries`，再 stop llama）。  
退出应用：藏窗 → 同上 finalize → `app.exit`。  
渲染 `memory-notify-chat-closed` 仅 `notePreferredConsolidateSession`。  
**Preload：** `electron/preload/memoryApi.ts` → 扁平展开进 `preload/index.ts` 的 `electronAPI`；键名与上表 channel 一一对应，禁止改成嵌套 `electronAPI.memory.*`。

### 出库（聊天 LLM 历史）

- `memoryEnabled` 开启时：`useChatSession` 发消息前经 IPC 取 `getRecentHistoryForPrompt`（本地 **10** / OpenAI **30** 轮，与 `historyWindow` 同额度）作为 `buildChatPromptMessages` 的 `history`；**不含**当前正要发送的 user（在 append 本轮 user 之前取）。**重新打开聊天**时同样默认取最近 10/30 轮（已有逻辑）。
- 同时取 `memory-get-prompt-context`：`core_memories` 按当前 `llmMode` 预算注入（OpenAI ≤5 / 本地 ≤2）；非空 `user_profile` **100%** 注入（独立【用户画像】块，**不占用** summary 的 1024/254 预算）；`session_summaries` + `period_summaries` 对 **key_facts/keywords**（与核心同套连续串+2–4 滑窗，匹配前归一化去空白/标点）及相关 **summary** 弱匹配打 `relevance`，再按 **`score = relevance × significance × decay`** 排序注入命中的 **key_facts**；若本轮零命中且用户含回忆触发词（记得/上次/以前/那天/之前），保底注入最多 **2** 条高 `significance×decay` 摘要的 key_facts（总结区：OpenAI &lt;1024 tok / 本地 &lt;254 tok）。
- 跨 session：按全局 `raw_logs.timestamp`；库内最多约 3 个 session 的 raw（prune 后）；周/月滚成功后另裁至最近 **2 个日历日**。
- UI 气泡仍只展示本窗内存，不回填旧消息。
- IPC 失败时回退内存 `historyWindow` 截断；记忆关闭时只用内存截断。

### 与聊天发送路径的调度分档（禁止总结堵首 token）

渲染入口：`src/services/memory/memoryClient.ts` + `scheduleMemoryBackground.ts`；编排：`useChatSession.sendUserMessage`。

| 档 | 时机 | 调用形态 | 示例 | 硬约束 |
|----|------|----------|------|--------|
| ① Prompt 必等 | 发消息前、LLM 请求前 | **`await`** | `getRecentHistory` / `getPromptContext` / `consumePendingPeeks` | 只读进 prompt；**禁止**把 consolidate / period 总结 LLM 塞进此档 |
| ② 开局后台 | 与 ① 同时段启动 | **`scheduleMemoryBackground`（不 await）** | `memory-maybe-period-rollup`；user `append-raw-log` | **不得**阻塞首 token；失败静默 |
| ③ 轮后 | 本轮 LLM+TTS **全部释放**且 assistant raw 已写 | assistant raw **`await`**；mid consolidate **`scheduleMemoryBackground`（不 await）** | `memory-maybe-mid-session-consolidate` | **不堵本轮首 token，也不拖下一句发送**；与关窗总结靠主进程 `consolidateChain` 串行；本地档可能与下一轮聊天抢同一 LLM |

关窗 consolidate / 主进程 `consolidateChain` 仍串行互斥；与 ② 开局 rollup 可能时间重叠，属有意设计。

### 总结（日常会话）

- 主进程调当前聊天 LLM（本地 llama / OpenAI 代理）；`memoryLlmSummarizeEnabled`（默认 true）
- HTTP 层复用 `withLlmChatRetry`（与聊天相同：软错误/网络最多 3 次重试；硬错误立即失败）；JSON 解析失败不重试
- 开关关闭、或 LLM 总结失败 → **不总结**（不写 `session_summaries`、不 prune）；成功时同 session 已有摘要则拼接累积，不覆盖
- **关窗总结**（保留）：`onChatWindowClosed` → `consolidateOnChatClose`（**仅**总结关窗前记下的 `preferredSessionId` 且该 session 已有 `raw_logs`；无新对话 / 无 preferred → **跳过，不调 LLM**，禁止回退到其它 session）→ 成功后再检周/月滚
- **满轮日常总结**（新增，不替代关窗）：本轮 LLM+TTS **全部释放**且 assistant 已写入 raw 后，`maybeConsolidateOnRoundCap`：
  - OpenAI：全局 raw **≥50 轮** → 总结最旧超额轮次 → 成功后裁到最近 **30** 轮（窗口在 30–50 间滚动）
  - 本地：全局 raw **≥20 轮** → 同理裁到最近 **10** 轮（10–20）
  - 失败不裁 raw；与关窗总结串行互斥
  - **调度：** 渲染侧 `maybeMidSessionConsolidateInBackground`（后台发起）；`sending` 在本轮 UI/TTS 结束后即释放，总结在后台跑（见上表 ③）

### 周 / 月滚总结 + 用户画像（含原 M4.3「经常性行为」）

- 表：`period_summaries`（`kind`=weekly|monthly）、`user_profile`（单行 `id=default`）；迁移 `0002_*`
- **周触发**（OR）：未归档 `session_summaries` 最旧距今天 ≥7 日历日 **或** 最旧→最新跨度 ≥7；跨数月（最旧距今天月份差 ≥2）跳过周、直接用会话总结做月
- **月触发**对称：材料最旧距今天月份差 ≥1 **或** 最旧→最新月份差 ≥1；正常路径吃 weekly
- 成功写 period 后删对应源；**失败不写 period、不删源、不裁 raw**；同进程有 60s attempt cooldown
- 成功后 `raw_logs` 仅保留今天起最近 **2 个日历日**
- **不碰**既有 `core_memories` 行（滚总结不删核心）；但周/月写入成功后若 `memoryEmotionScoreEnabled` 且 `significance ≥ 9.5`，与会话总结相同规则 **可晋升** 核心池（`category`=`周总结`/`月总结`）
- **用户画像（= M4.3 经常性行为落点）**：**仅** `kind=monthly` 成功后 LLM 创建/更新**全部字段**（含 `frequent_behaviors`≤10）；非空画像 **100%** 注入 system（不占 summary/核心池预算）。**周总结不碰画像**。画像 LLM 失败**不回滚**月总结。
- **明确不做：** 再搞一套「重复行为 → habit `core_memories`」——与画像双写/双注入冗余。
- 画像字段：`interests` / `summary` / `personality` / `age` / `address_name` / `attitude_to_neko` / `frequent_behaviors`（≤10）；`source_weekly_id` 存最近一次驱动更新的月总结 id

### 情感权重（M4.2）

- 字段：`session_summaries.significance`（0–10）、`keywords`（JSON）；迁移 `0001_*`
- **单次 LLM**：关窗总结与打分合并为一份 JSON（`summary` + `key_facts` + `emotion_tags` + `significance` + `keywords`），不再二次请求；transcript 带本地时间戳 `[YYYY-MM-DD HH:mm] 角色: 内容`。prompt 要求 `keywords` 短、可检索、优先专名/实体（`KEYWORDS_RECALL_HINT`，会话与周月共用）；`key_facts` 尽量含可检索专名
- `memoryEmotionScoreEnabled`（默认 true）：控制是否**落库分数/关键词并晋升核心池**；关闭则仍可总结但不写分
- 核心池：`significance ≥ 9.5` → `tryPromoteToCorePool`；**活力系数** `weight` = `significance * exp(-days/halfLife) * (1+log1p(hitCount*2))`（halfLife：emotion_peak=90 / habit=30 / fact=7）。满池竞赛：新记忆 vitality×**0.7** 对比池内最低现算 vitality；相等或更低则不入池（无随机）。会话/周月总结 JSON 含 `memory_kind`；每轮用户发言对核心做连续串+滑动窗口命中（强+2 / 弱+1 hit），并全池重算 weight
- **按 LLM 模式分层预算**（`memoryBudgets.ts`，随 `chat-config.llmMode`）：
  - `openai_api`（默认现网）：核心 **≤5**、单条 **~300 tok**、总结注入 **&lt;1024 tok**
  - `local_llama`：核心 **≤2**、单条 **~100 tok**、总结注入 **&lt;254 tok**
- 检索：`retriever.ts` — 无 embedding；核心必带（按档位截条数/截长）；类 RAG（facts/keywords 滑窗 + summary 弱匹配 + score 主序 + 回忆触发保底）
- **偷窥标记（记忆空间）**：用户**点开**记忆空间 → `recordMemoryPeek` 写入一条待消费 `event_type=peek`（时间线对用户隐蔽；面板内刷新/换层级不重复记）。**下一轮**发聊天时 `consumePendingPeeksForUserTurn` 取出全部 pending，拼到发给 LLM 的 **user** 内容前（形如 `【用户（YYYY-MM-DD HH:mm）偷看了你的记忆和小心思】`），**前端气泡仍只显示用户原文**；消费后**删除**这些事件 → 后续轮次不再带前缀，除非再次点开。不进 system。**`raw_logs` 只写用户原文**（UI 路径已传干净文本；`appendRawLog` 对 user 再 `stripPeekUserInjectPrefix` 兜底）。旧版 peek 相关 `memory_meta` 键在启动/记录/消费时清掉，不再使用。
