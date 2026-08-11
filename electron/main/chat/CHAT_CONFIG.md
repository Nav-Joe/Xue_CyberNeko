# 聊天配置 `chat-config.json`

Electron 主进程读写 `{userData}/chat-config.json`；渲染进程经 IPC `chat-read-config` / `chat-write-config` 访问（不含 `apiKey` 明文，除非关闭「密文保存」时回显供编辑）。

## 默认值（文件不存在或字段缺失时）

| 字段 | 默认 |
|------|------|
| `llmMode` | `local_llama` |
| `ttsEnabled` | `true` |
| `ttsParallelEnabled` | `false` |
| `ttsParallelLanes` | `2` |
| `openaiApiKeySecretSave` | `false` |
| `memoryEnabled` | `true`（可在设置关闭） |
| `memoryConsolidateOnChatClose` | `true`（关聊天窗是否触发整理；仍受 `memoryEnabled` 门控） |
| `memoryLlmSummarizeEnabled` | `true`（关闭或失败则不总结） |
| `memoryEmotionScoreEnabled` | `true`（落库分数/关键词并晋升核心池；总结与打分为同一次 LLM） |
| `desireEnabled` | `true`（官方情感模拟插件总闸；关则欲望/好感鉴定与注入停，分数保留） |
| `relationshipEnabled` | `true`（**冷落镜像**：仅随插件开关双写；门闩只认 `desireEnabled`，勿单独解读） |
| `local.selectedBaseUrl` | 见 `llmConstants.DEFAULT_LLAMA_BASE_URL` |
| `local.selectedModelId` | `""` |
| `local.outputFormat` | `openai` |
| `local.temperature` | `0.7` |
| `openai.baseUrl` | 见 `llmConstants.DEFAULT_OPENAI_BASE_URL` |
| `openai.model` | `""` |
| `openai.outputFormat` | `openai` |
| `openai.temperature` | `0.7` |
| `apiKey` | `""`（磁盘上应为空；历史明文会在读取时迁移） |
| `apiKeyEnc` | 缺省；有 Key 时为 `safeStorage.encryptString` 的 base64 |
| `sttEnabled` | `false`（M5 语音输入总闸；关 = 无麦入口、无 STT 请求） |
| `sttAutoSend` | `false`（`true` 识别后自动发送；`false` 追加到输入框） |
| `sttBaseUrl` | `""`（空 = 客户端按 8767–8772 探 `/health`；非空则直连） |
| `sttDeviceId` | `""`（空 = 系统默认麦；非空为 `MediaDeviceInfo.deviceId`） |

首次启动时主进程会创建带上述默认值的 JSON 文件。缺字段 / 非法类型回落见 `createDefaultChatConfig()`。

## 布尔字段读口径

磁盘缺键、类型异常或历史脏值时，用不同比较是为了 **偏向产品默认开/关**，避免功能不受控地整片灭掉或突然打开——**不是**两套随便混用的风格。

| 口径 | 缺省/异常时偏向 | 典型字段 |
|------|-----------------|----------|
| **`!== false`** | **开**（默认开的能力） | `ttsEnabled`；`memoryConsolidateOnChatClose` / `memoryLlmSummarizeEnabled` / `memoryEmotionScoreEnabled`；`desireEnabled`；镜像 `relationshipEnabled` |
| **`=== true`** | **关**（默认关，或须明确打开） | `sttEnabled` / `sttAutoSend`；`ttsParallelEnabled`；`openaiApiKeySecretSave`；View 上的 `memoryEnabled`（落盘 normalize 已按默认补 `true`，View 再严格认一次） |

权威实现：`toChatConfigView`（`chat-config.ts`）。渲染侧门闩应对齐上表（如 STT 用 `=== true`，对话 TTS / 欲望用 `!== false` 或等价）。  
**禁止**为「写法整齐」全局改成同一种比较符而不改缺省语义。

## API Key 落盘（safeStorage）

- 主进程内存持有明文供 LLM 代理使用；**写入磁盘时**优先写成 `apiKeyEnc`，并把 `apiKey` 置空。
- 读取时若仍有旧版明文 `apiKey`、且本机 `safeStorage.isEncryptionAvailable()`，自动加密回写并清除明文。
- 加密不可用（少见，如部分 Linux 无密钥环）时回退明文 `apiKey` 并打 warn，避免丢 Key。
- `openaiApiKeySecretSave` 只控制是否向渲染进程回显明文，与落盘加密正交。

## 自动保存

设置页内切换 LLM 模式、TTS / 并行开关、语音输入（STT）开关、本地模型选择、OpenAI 字段等变更会**立即写回**此文件，无需重复进入设置。开启 `sttEnabled` 时主进程会 ensure `stt_service`（已在跑则复用）；关闭时仅停止本应用拉起的侧车。

## 注意事项

- `writeChatConfigFile` 对未传入的字段**保留磁盘现有值**（勿用 `undefined` 覆盖）。
- llama bootstrap 仅更新 `local.selectedBaseUrl` / `selectedModelId`，**不修改** `llmMode` 与 TTS 开关。
- 用户选择 `openai_api` 时，进入聊天**跳过** llama bootstrap。
- 实现：`apiKeyAtRest.ts` + `chat-config.ts`；勿在渲染进程持久化 Key。

| 模块 | 路径 |
|------|------|
| 读写 / Key / View | `electron/main/chat/chat-config.ts`、`apiKeyAtRest.ts` |
| 脏 JSON 规范化 / 旧扁平迁移 | `electron/main/chat/chatConfigNormalize.ts` |
| IPC | `electron/main/ipc/chatConfig.ts` |
| 渲染进程 store | `src/services/chat/chatConfigStore.ts` |
| 类型 | `src/services/chat/types.ts` |

角色卡另存 `{userData}/character-cards.json`，见 `character-cards.ts`。
