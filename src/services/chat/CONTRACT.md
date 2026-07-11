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
- `buildChatPromptMessages({ card, history, userInput })` — `@langchain/core` `ChatPromptTemplate`，输出 `ChatHistoryMessage[]`（`user` / `assistant` / `system`），供 llama-server 与 OpenAI 形 API 共用。
- `listCharacterRagDocumentIds(card)` — M4 RAG 预留。

## TTS 分段（模块 1）

- `splitTextForTts` / `drainCompleteTtsSegments` — 按句末标点切分；流式缓冲与整段回复共用。
- `stripTextForTts` / `containsKaomoji` — TTS 推理前去掉 emoji 与颜文字；UI 展示仍保留原文。

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
| LLM | `llmChat` / `llmChatWithRetry` — 软错误（网络、5xx、429 等）最多自动重试 3 次；硬错误（Key/余额/配置）立即失败 |
| 持久化 | M3 仅内存会话；关闭聊天窗 / 清空会话即丢弃全部消息，不写磁盘（M4 记忆预留） |
| 上下文窗口 | 发往 LLM 前 `historyWindow.ts` 截断：`local_llama` 最近 **10 轮**，`openai_api` 最近 **30 轮**（1 轮 = user + assistant）；UI 仍展示本会话全部气泡 |

## 聊天设置（模块 5）

| 项 | 说明 |
|----|------|
| 入口 | 聊天窗标题栏 **⚙** → `ChatSettingsView.vue` 全屏替换聊天区 |
| 返回 | 「← 返回聊天」→ 刷新 `useChatSession.initSession()` |
| LLM | `ChatLlmSettings.vue` — 枚举切换 `local_llama` / `openai_api`，仅展示当前模式对应配置区 |
| 角色卡 | `ChatCharacterCardSettings.vue` — CRUD + 名称 / 设定 / 喜好 |

## 对话 TTS（模块 6）

| 项 | 说明 |
|----|------|
| 开关 | `chat-config.json` → `ttsEnabled`（默认 `true`）；UI：`ChatTtsSettings.vue` |
| 并行 | `ttsParallelEnabled`（默认 `false`）、`ttsParallelLanes`（2/3/4，默认 `2`）；关闭 TTS 时 UI 隐藏；请求体 `parallel_lanes`（0=串行） |
| 流水线 | `chatTtsPipeline.ts` — 非流式先切分再 `enqueueAll`；**无首句优先**；串行预取窗口最多 5；**并行时在飞数 = 并路数**，队头释放后立即补下一句 → **严格按句序** reveal + 播放 |
| 播放 | **`chatTtsSession.ts`** — 每句 `fetchChatTtsBlob(text, speakerId, order, parallelLanes)`；串行时后端 **严格按 order 0→1→2… 推理**；并行时后端最多 N 路同时占用 GPU，前端仍按序 reveal+播放 |
| 破圈测试 | `scripts/benchmark_chat_tts_scheduling.py` — 模拟对比 serial / batch / parallel_pool；`--calibrate` 用 live TTS 拟合参数 |
| 口型 | `ttsPlayer.playBlob` → `runLipSyncWhilePlaying`；聊天 Live2D 已 `registerLive2DModelForLipSync` |
| 会话 | `useChatSession` — 流式 `pushDelta` + **`flush` 仅此收尾**（禁止再 `revealFullText` 避免重复）；非流式 `revealFullText`；**每句独立 assistant 气泡**；发送前 `stopSpeaking()` |
| 触摸互斥 | `replyPending` — LLM 回复进行中锁定聊天窗 Live2D `interactionLocked`，回复完成或关窗/出错解锁；**不含** TTS 播放时段 |

## LLM 客户端（模块 3）

| 项 | 说明 |
|----|------|
| 配置 | `{userData}/chat-config.json`（见 `electron/main/chat/CHAT_CONFIG.md`）：`local`、`openai`、`ttsEnabled`、`ttsParallelEnabled`、`ttsParallelLanes`；设置页修改即自动写回 |
| 本地 | `localLlamaDiscovery.ts` 扫描常见端口；UI 列表选模型，无需手填 URL |
| OpenAI | 用户填写 `openai.baseUrl`、`openai.model`、API Key（Key 仅存主进程） |
| IPC OpenAI | `chat-openai-completion` / `chat-openai-list-models` |
| 本地 bootstrap | `beginChatLlamaSession` / `endChatLlamaSession` / `probeLocalLlamaServer`；设置内切到 `local_llama` 时若未运行则同样走 bootstrap 遮罩 |
| UI 主题 | `chat-panel-theme.css` — Home 粉色系 |
