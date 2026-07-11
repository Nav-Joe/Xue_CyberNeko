# 聊天配置 `chat-config.json`

Electron 主进程读写 `{userData}/chat-config.json`；渲染进程经 IPC `chat-read-config` / `chat-write-config` 访问（不含 `apiKey` 明文）。

## 默认值（文件不存在或字段缺失时）

| 字段 | 默认 |
|------|------|
| `llmMode` | `local_llama` |
| `ttsEnabled` | `true` |
| `ttsParallelEnabled` | `false` |
| `ttsParallelLanes` | `2` |
| `local.selectedBaseUrl` | 见 `llmConstants.DEFAULT_LLAMA_BASE_URL` |
| `local.selectedModelId` | `""` |
| `local.outputFormat` | `openai` |
| `local.temperature` | `0.7` |
| `openai.baseUrl` | 见 `llmConstants.DEFAULT_OPENAI_BASE_URL` |
| `openai.model` | `""` |
| `openai.outputFormat` | `openai` |
| `openai.temperature` | `0.7` |
| `apiKey` | `""`（仅主进程存储） |

首次启动时主进程会创建带上述默认值的 JSON 文件。

## 自动保存

设置页内切换 LLM 模式、TTS / 并行开关、本地模型选择、OpenAI 字段等变更会**立即写回**此文件，无需重复进入设置。

## 注意事项

- `writeChatConfigFile` 对未传入的字段**保留磁盘现有值**（勿用 `undefined` 覆盖）。
- llama bootstrap 仅更新 `local.selectedBaseUrl` / `selectedModelId`，**不修改** `llmMode` 与 TTS 开关。
- 用户选择 `openai_api` 时，进入聊天**跳过** llama bootstrap。

| 模块 | 路径 |
|------|------|
| 读写 / 迁移 | `electron/main/chat/chat-config.ts` |
| IPC | `electron/main/ipc/chatConfig.ts` |
| 渲染进程 store | `src/services/chat/chatConfigStore.ts` |
| 类型 | `src/services/chat/types.ts` |

角色卡另存 `{userData}/character-cards.json`，见 `character-cards.ts`。
