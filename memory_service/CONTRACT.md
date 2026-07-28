# memory_service — CONTRACT

> 可选的独立 Python 小服务（总结相关）。与 Electron 主进程记忆库解耦。

## 边界

- **允许：** HTTP JSON 任务（总结 / 后续情感 / 冲突）
- **禁止：** 直接打开 `{userData}/memory.db`；把记忆逻辑塞进 `tts_voice/`
- **落库：** 仅 Node `electron/main/memory/` 写 SQLite

## 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 探活 |
| POST | `/v1/summarize` | 会话总结（当前为模板；可换 LLM） |

## 启动（可选）

```bash
.venv\Scripts\python.exe -m uvicorn memory_service.app:app --port 8766
```

Node 关窗总结走主进程聊天 LLM（`summarizeLlm.ts`），不依赖本服务在线；本服务 `/v1/summarize` 仍为可选占位端点。
