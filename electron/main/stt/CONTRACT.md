# STT 主进程代启

> **对齐：** `stt_service/CONTRACT.md` · `electron/main/chat/CHAT_CONFIG.md`  
> **职责：** 开 `sttEnabled` 时确保侧车在跑；关总闸时仅停止**本应用拉起**的进程。

## 边界

| 允许 | 禁止 |
|------|------|
| 探活 / spawn `python -m stt_service` / 停托管进程 | 转发音频大包；改 `tts_voice` |
| ownership：`none` / `external` / `app_spawned` | 关总闸时杀掉用户手开的侧车 |
| IPC 薄封装 | 把 spawn 逻辑塞进渲染 / `useChatSession` |

## Ownership

| 态 | 含义 |
|----|------|
| `none` | 未托管、未检出 |
| `external` | 探活发现已在跑（非本应用 spawn） |
| `app_spawned` | 本应用 `spawn` 成功 |

- **ensure：** 已通 → 记 `external`（若原非 app_spawned）并返回；不通 → spawn → `app_spawned`  
- **stopManaged：** 仅 `app_spawned` 时 kill；`external` / `none` 不杀  
- **退出 App：** 调用 `stopManagedSttService`

## IPC

| Channel | 说明 |
|---------|------|
| `stt-ensure-service` | 探活或代启；`{ ok, baseUrl? }` / `{ ok:false, detail }` |
| `stt-stop-managed` | 关总闸：只停 app_spawned |

Preload：`electron/preload/sttApi.ts` → 扁平挂 `electronAPI`。

## Python

开发态：仓库根 `.venv`（Win：`Scripts/python.exe`；Unix：`bin/python`）。  
cwd = `projectRoot()`；端口仍由侧车按 8767–8772 自选。
