# Chat 服务契约（M3）

`src/services/chat/` 为里程碑 3 聊天能力；与 Pet、voice-forge、Python reconcile 解耦。

## 角色卡持久化

| 项 | 说明 |
|----|------|
| 文件 | `{userData}/character-cards.json` |
| 主进程 | `electron/main/chat/character-cards.ts` |
| IPC | `chat-read-character-cards` / `chat-write-character-cards` |
| Preload | `electronAPI.readCharacterCards()` / `writeCharacterCards(store)` |
| Renderer | `characterCardStore.ts`（load/save 包装）+ `characterCardMutations.ts`（纯 CRUD） |

### JSON 结构

```json
{
  "activeCardId": "default",
  "cards": [
    {
      "id": "default",
      "name": "雪澜",
      "rolePrompt": "（见 characterCardDefaults.ts）",
      "likes": "草莓",
      "ragDocumentIds": [],
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

- 内置默认卡模板：`src/services/chat/characterCardDefaults.ts`（入库）；镜像 JSON：`electron/main/chat/character-cards.default.json`。
- 用户实际数据仍写 `{userData}/character-cards.json`（**不入库**）；仅当 default 卡字段为空时自动补模板，不覆盖已编辑内容。

- `id: "default"` 为内置**固定槽位**「默认角色卡」，不可删除、始终置顶；用户在此槽位内编辑并保存后，以 userData 中内容为准（仅字段为空时补入库模板）。
- 自定义角色卡追加在默认槽位之后，不会替换默认槽位。
- 文件不存在或损坏时主进程自动写入默认结构。

## Prompt 构建

- `formatCharacterSystemPrompt(card)` — 角色卡 → system 文本。
- `formatChatLocalTimeLabel(now?)` — 本轮本地时间一行（`当前本地时间：YYYY-MM-DD HH:mm（周X）`）。
- `buildChatPromptMessages({ card, history, userInput, memoryBlock?, desireBlock?, relationshipBlock?, petTouchBlock?, now? })` — system 顺序为角色卡 → 本地时间 → 记忆块 → 欲望块 → 关系姿态块 → 今日摸摸状况。偷看标记不进 system：打开记忆空间后，**下一轮**发给 LLM 的 `user` 内容前会拼 `【用户（时间）偷看了…】`（UI 气泡与 `raw_logs` 仍只保留用户原文）。
- `listCharacterRagDocumentIds(card)` — M4 RAG 预留。

## TTS 分段（模块 1）

- `splitTextForTts` / `drainCompleteTtsSegments` — 按句末标点切分；流式缓冲与整段回复共用。
- `stripTextForTts` / `containsKaomoji` — TTS 推理前去掉 emoji、颜文字、「（）」/「()」旁白与省略号（`...` / `…`）；UI 展示仍保留原文。

## 开发入口（人工验证）

- **桌宠** 模型旁 **文字聊天快捷按钮** → `useChatEntry.openChat({ origin: 'pet' })`；打开聊天窗时隐藏桌宠，关闭后恢复桌宠。
- **家窗口** 点击 **「文字聊天」** → `openChat({ origin: 'home' })`；隐藏 Home → 打开独立聊天窗口；关闭聊天窗口后自动恢复 Home。
- 聊天 UI：`ChatWindowView.vue` + `ChatApp.vue`；主进程 `electron/main/chat/window.ts`。

## 对话会话（模块 4）

| 项 | 说明 |
|----|------|
| Composable | `useChatSession.ts` — messages、send、clear、错误态、流式（local_llama） |
| UI | `ChatMessageList.vue` + `ChatComposer.vue` + `ChatWindowView.vue` |
| Prompt | `buildChatPromptMessages` + 当前 **active** 角色卡 |
| LLM | `llmChat` / `llmChatWithRetry` — 软错误（网络、5xx、429 等）最多自动重试 3 次；硬错误（Key/余额/配置）立即失败；通用包装 `withLlmChatRetry` 供记忆总结等复用 |
| 持久化 | 本窗 UI 仍仅内存；关窗丢气泡。`memoryEnabled` 时写入 `raw_logs`；发往 LLM 的先验历史改从 DB 取最近 N 轮（见下） |
| 上下文窗口 | `local_llama` **10** 轮 / `openai_api` **30** 轮（1 轮 = user + 连续 assistant）。记忆开：`memory-get-recent-history` 读 `raw_logs`（timestamp 从新往旧）；记忆关或 IPC 失败：回退内存 `historyWindow`。UI 不回填跨窗气泡。另：全局 raw 达 **20/50** 轮时，本轮 LLM+TTS 结束后日常总结并裁回 **10/30**（见 memory CONTRACT；满轮总结后台跑，不拖下一句发送） |
| 记忆注入 | 按 `llmMode` 分层：`openai_api` 核心≤5/~300tok、总结&lt;1024tok；`local_llama` 核心≤2/~100tok、总结&lt;254tok。key_facts 类检索（含 `period_summaries`）+ significance 优先；非空用户画像 100% 注入且不占总结预算。发消息时后台发起周/月滚（`scheduleMemoryBackground`，不堵首 token） |
| 欲望注入 | 发消息前：记忆/欲望均开才注入 Top-N。轮后后台鉴定：有活跃每轮；无活跃则助手回复自我欲关键词强命中才调 LLM；未提及 open 默认 neutral；单次 create≤1 |
| 好感鉴定 | 随「官方情感模拟插件」总闸（`desireEnabled`）+ 记忆总闸。渲染侧每 3 轮 / 关窗后台 → 主进程 LLM 提议并写库 |
| 好感注入 | 发消息前只读三维分 + TAG → system（desire 之后） |
| 好感面板 | 家窗口入口（类记忆空间）；雷达 + 条 + **今日**净变化；只读 |
| 摸摸 prompt | 记忆开则注入今日部位次数；**不**绑情感插件（关插件仍报告摸摸次数） |
| 情感插件 UI | 桌宠右键 → 设置 → `EmotionPluginSettings`（记忆总闸 + `desireEnabled`）；聊天设置不再放记忆/情感 |

## 聊天设置（模块 5）

| 项 | 说明 |
|----|------|
| 入口 | 聊天窗标题栏 **⚙** → `ChatSettingsView.vue`（TTS / 语音输入 STT / LLM / 角色卡；记忆与情感在桌宠右键设置） |
| 返回 | 「← 返回聊天」→ 刷新 `useChatSession.initSession()` |
| LLM | `ChatLlmSettings.vue` — `provide`/`inject`（`CHAT_LLM_SETTINGS_KEY`）+ 子组件 `ChatLlmModePicker` / `ChatLlmLocalSettings` / `ChatLlmOpenAiSettings`；枚举切换 `local_llama` / `openai_api`，仅展示当前模式对应配置区；逻辑仍在 `useChatLlmSettings` |
| 角色卡 | `ChatCharacterCardSettings.vue` — CRUD + 名称 / 设定 / 喜好 |

## 对话 TTS（模块 6）

| 项 | 说明 |
|----|------|
| 开关 | `chat-config.json` → `ttsEnabled`（默认 `true`）；UI：`ChatTtsSettings.vue` |
| 并行 | `ttsParallelEnabled`（默认 `false`）、`ttsParallelLanes`（2/3/4，默认 `2`）；关闭 TTS 时 UI 隐藏；请求体 `parallel_lanes` |
| 流水线 | `chatTtsPipeline.ts` — 非流式先切分再 `enqueueAll`；**无首句优先**；须把 `ttsParallelLanes` **原样转发**给 `createChatTtsSession({ parallelLanes })`（vitest 锁定） |
| 播放 | **`chatTtsSession.ts`** — 每句 `fetchChatTtsBlob(..., order, parallelLanes)`；reveal/播放 **始终按句序队头** |
| 破圈测试 | `scripts/benchmark_chat_tts_scheduling.py` |
| 口型 | `ttsPlayer.playBlob` → `runLipSyncWhilePlaying`；聊天 Live2D 已 `registerLive2DModelForLipSync` |
| 会话 | `useChatSession` — 流式 `pushDelta` + **`flush` 仅此收尾**；非流式 `revealFullText`；**每句独立 assistant 气泡**；发送前 `stopSpeaking()` |
| 触摸互斥 | `replyPending` — LLM 回复进行中锁定聊天窗 Live2D；实现上 `flush`/`revealFullText` 在开 TTS 时会 `await` 到播完，故 `sending`/`replyPending` **实际会覆盖到朗读结束** |
| 输入/STT 互斥 | **开 `ttsEnabled`**：`sending` 为真期间禁用打字与麦（等合成+播完）；**关 TTS**：无朗读门闩，仅普通发送中禁用。STT **不得** `stopSpeaking` 抢播 |

### 对话 TTS · `parallel_lanes` 真相表（与 `tts_voice/CONTRACT.md` 双写）

> 对照实现：前端 `chatTtsSession.ts` / `ttsPlayer.fetchChatTtsBlob`；后端 `batch_inference.dispatch_synthesize_chat`。  
> **并行时前端仍传 `order`、后端忽略 `order`：有意设计，禁止修改**（展示序由前端队头释放链保证；后端 ParallelChatPool 不得再按 order 阻塞，否则易死等）。

| `parallel_lanes` | 前端合成闸门 | 后端调度 | `order` 字段 |
|------------------|----------------|----------|--------------|
| **`0`（默认串行）** | 相对释放指针最多 **5** 预取（`CHAT_TTS_MAX_BATCH_SIZE`，≠ 五路 GPU） | `synthesize_immediate`：**严格按 order 0→1→2…** 占 GPU | **必须遵守** |
| **`1`** | 同串行（窗=5） | 同串行有序路径（`>=2` 才进并行池） | **必须遵守** |
| **`2`–`4`** | **`synthInFlight < lanes`**；就绪 blob 留 slot；释放仍按队头；另有硬编码软保险 `readyButUnreleased < lanes×3` | `ParallelChatPool`：最多 N 路 GPU，完成顺序任意 | 请求里**仍携带**；**后端忽略**。**有意设计，禁止修改** |

### 人话说明：前后端怎么配合

一句话：**谁先合成完不重要，谁先播必须按句序；并行只加快合成，不抢播放顺序。**

```
设置（开不开并行、几路）
  → useChatSession 算出 parallelLanes（关并行=0，开=2/3/4）
  → chatTtsPipeline 原样交给 chatTtsSession
  → 每句 HTTP /tts（带 order + parallel_lanes）
  → Python：lanes<2 按 order 单路排队；lanes≥2 最多 lanes 路一起合成（不管 order）
  → 前端仍按第 1 句→第 2 句… 展示并播放
```

容易误会的点：

1. **串行时的「5」**：前端最多挂大约 5 个还没播完的请求在路上；**不是** Python 开了 5 路 GPU。后端还是一句接一句按序号合成。  
2. **并行时的 `order`**：请求里还会带序号（方便日志），但 **Python 并行池故意不按序号卡住**；若后端也按序号等，并行会假死或变回串行。顺序只靠前端「队头才能播」。  
3. **`batch_inference` 这个名字**：里面既有触摸批量，也有聊天串行/并行。聊天并行走的是 `ParallelChatPool`，不是那条「凑一批再推理」的 micro-batch。  
4. **改 lanes 时**：前端在飞合成数与后端信号量都应是同一个 lanes；有序播放始终只在前端。

护栏测试：前端 `chatTtsSession.test.ts` / `chatTtsPipeline.test.ts`；后端 `tts_voice/tests/test_batch_inference.py`。

补充：

- UI / 配置类型仅为 `2|3|4`；API 仍允许 `1`（只文档化，**不**在本轮禁止）。  
- 并行档：FE **合成并发**与 BE semaphore **必须同为 lanes**；有序 reveal/播放仍仅由 FE `releaseChain` 保证（不再用「未释放窗」卡住合成补槽）。  
- 关闭 TTS 或未开并行时，`useChatSession` 传入 `ttsParallelLanes = 0`。

## 语音输入 STT（M5.2）

| 项 | 说明 |
|----|------|
| 总闸 | `sttEnabled` 默认 `false`；关 = 无麦、无 HTTP；纯打字与升级前一致 |
| 结果 | `sttAutoSend=false`：**追加**到输入框；`true`：走现有 `sendUserMessage` |
| 麦克风 | `sttDeviceId`（空=系统默认）；设置页下拉；启动时后台 `warmMicDevicesInBackground` |
| 电平 | 仅录音态；操作区左侧横向条；同源 PCM peak 平滑 |
| 交互 | 点麦 → 录音（输入框禁打字）→ 点结束 → 「识别中」文案 → 出字 |
| 客户端 | `src/services/stt/` + `useChatStt`；侧车见 `stt_service/CONTRACT.md` |
| TTS 互斥 | **开对话 TTS**：`sending` 覆盖到播完，期间禁打字/麦；STT 不开录、不 `stopSpeaking` 抢播。**关 TTS**：无朗读门闩 |
| 代启 | 开总闸 / 点麦前 `ensureSttService`；关总闸 `stopManagedSttService`（仅 app_spawned）；见 `electron/main/stt/CONTRACT.md` |

Python 侧同文：`tts_voice/CONTRACT.md` §Chat TTS parallel。

## LLM 客户端（模块 3）

| 项 | 说明 |
|----|------|
| 配置 | `{userData}/chat-config.json`（见 `electron/main/chat/CHAT_CONFIG.md`）：`local`、`openai`、`ttsEnabled`、`ttsParallelEnabled`、`ttsParallelLanes`、`sttEnabled` / `sttAutoSend` / `sttBaseUrl`；设置页修改即自动写回 |
| 本地 | `localLlamaDiscovery.ts` 扫描常见端口；UI 列表选模型，无需手填 URL |
| OpenAI | 用户填写 `openai.baseUrl`、`openai.model`、API Key（Key 仅存主进程） |
| IPC OpenAI | `chat-openai-completion` / `chat-openai-list-models` |
| 本地 bootstrap | `beginChatLlamaSession`（单飞）/ `endChatLlamaSession` / `probeLocalLlamaServer` / `cancelLocalModelDownload` / `reconcileInterruptedLlamaDownloads`。点 X → `onChatWindowClosed`。详见 `electron/main/llama/CONTRACT.md` |
| Bootstrap UI | Pet/Home（`useChatEntry`）与 Chat 窗（`ChatWindowView`）各一份 `useChatLlamaBootstrap`：**Electron 多窗口正常产物，非待修复项**；生命周期与并发由主进程兜底，勿跨窗强行 Vue 单例 |
| UI 主题 | `chat-panel-theme.css` — Home 粉色系 |
