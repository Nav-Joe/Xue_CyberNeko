# llama-server 会话生命周期（OPT-03 / OPT-03c / OPT-03d）

> **位置：** `electron/main/llama/CONTRACT.md`  
> **对照实现：** `session.ts` · `sessionBootstrapAssets.ts` · `downloadLifecycle.ts` · `modelResolve.ts` · `managedOwnership.ts` · `singleFlight.ts` · `download.ts`（门面）· `downloadHttp.ts` · `downloadArtifacts.ts` · `constants.ts`  
> **相关：** `src/services/chat/CONTRACT.md`（本地 bootstrap IPC）

---

## 文件职责（写死 · OPT-03c / OPT-03d / OPT-12 A+B）

| 文件 | **只负责** | **禁止塞进** |
|------|------------|--------------|
| `session.ts` | 探测端口 / spawn·waitReady / ownership 内存态 / `begin` 单飞 / `stopManagedLlamaServer`；调用 bootstrap 资产下载 | AbortController、cancel、reconcile、onChatWindowClosed、sweep 编排、GGUF 路径解析、server zip/默认模型下载实现 |
| `sessionBootstrapAssets.ts` | `resolveLlamaServerExe`、`ensureLlamaServerExe`、`downloadDefaultLocalModelFile`、bootstrap 进度桥 | spawn、ownership、begin 单飞、写 chat-config、cancel/关窗 |
| `downloadLifecycle.ts` | abort scope、`reconcileInterruptedLlamaDownloads`、`cancelLlamaDownload`、`onChatWindowClosed`、`afterDownloadAborted`、调用 `download` 门面的 sweep | spawn、ownership 赋值、端口探测、写 chat-config、`resolveUsableLocalModelPath` |
| `modelResolve.ts` | `resolveUsableLocalModelPath`、`getLocalModelStatus`；按 `MIN_USABLE_GGUF_BYTES` / `.expected` 清残缺 GGUF | spawn、abort、IPC、写 chat-config |
| `constants.ts` | 含 **`MIN_USABLE_GGUF_BYTES`**（lifecycle 与 modelResolve 共用，禁止各写一份） | 运行时状态 |
| `download.ts` | 再导出门面（调用方统一从此 import） | 新业务逻辑（实现放 Http / Artifacts） |
| `downloadHttp.ts` | HTTP probe / 写 partial / 镜像回退 / Abort | zip 解压、模型目录 sweep、IPC、进程生命周期 |
| `downloadArtifacts.ts` | `.partial` / `.expected`、zip 展平、GGUF 列表与 incomplete sweep | HTTP 拉取、Abort 编排、IPC |
| `managedOwnership.ts` | ownership 类型、`decideStopAction` / `isManagedLlamaRunning` 纯函数 | I/O、下载 |

**双向依赖解法（写死）：** `downloadLifecycle` **不得** import `session`。`session` 在定义 `stopManagedLlamaServer` 后调用 `bindLlamaSessionStop(stopManagedLlamaServer)`；lifecycle 取消/关窗只调该注入回调。

---

## 一句话

**内存 ownership 是唯一真相源；pid 文件只诊断；并发 begin 单飞复用，只 spawn 一次。**

---

## 状态图

```
                    begin / probe
                         │
                         ▼
                   ┌───────────┐
                   │   none    │
                   └─────┬─────┘
              ┌──────────┴──────────┐
              │                     │
     端口已有外部 llama        本应用 spawn 成功
              │                     │
              ▼                     ▼
        ┌──────────┐          ┌─────────────┐
        │ external │          │ app_spawned │
        └────┬─────┘          └──────┬──────┘
             │                       │
             │ 关聊天窗               │ 关聊天窗 L-delay
             │ stop（不 kill）         │ 先记忆整理再 kill(managedPid)
             ▼                       ▼
                   ┌───────────┐
                   │   none    │
                   └───────────┘

进程 exit 回调（仅当 child === managedProcess）：
  app_spawned → none，清内存 pid，清诊断 pid 文件
```

并发路径（单飞锁）：

```
Caller A ──┐
Caller B ──┼──► beginSessionSingleFlight ──► 只跑一次 runBegin / 最多一次 spawn
Caller C ──┘         │
                     └── 全部 await 同一 Promise 结果
```

---

## 所有权与 stop 真值表

| ownership | managedPid | shouldKill | 说明 |
|-----------|------------|------------|------|
| `none` | * | 否 | 无托管 |
| `external` | * | 否 | 外部进程，**绝不 kill** |
| `app_spawned` | `null` | 否 | 异常缺 pid，不清杀 |
| `app_spawned` | 数字 | **是** | 仅杀内存中的 managedPid |

**禁止：** 用 `.runtime/llama-server.pid` 参与 `shouldKill` / `isManagedLlamaRunning`。

---

## pid 文件角色

| 用途 | 允许 |
|------|------|
| spawn 后写入，便于人工排查 / 日志 | ✅ 诊断 |
| 进程 exit / stop 时清理 | ✅ 卫生 |
| 决定是否 kill | ❌ |
| 判定「本应用是否在跑」 | ❌（改看 ownership + ChildProcess） |

---

## 下载取消

| 项 | 说明 |
|----|------|
| IPC | `chat-cancel-local-model-download` → `cancelLlamaDownload`（`downloadLifecycle.ts`） |
| 动作 | abort 当前下载 → 清扫未完成文件（不删完整模型）→ 注入的 `stopManagedLlamaServer` |
| 落盘 | 先写 `*.gguf.partial`，成功后再 rename；中断不会留下「假完整」GGUF |
| 残缺防护 | `< 1.2GB` 或未达 `.expected` 体积的文件在探测 / sweep 时清理 |

### 异常关窗（点 X）

| 时机 | 行为 |
|------|------|
| 聊天窗 `closed` | `onChatWindowClosed`：若有下载在飞或磁盘半成品 → `cancelLlamaDownload`；否则 **L-delay**：先记忆整理再 `stopManagedLlamaServer({ onlyPid: 关窗快照 })`，避免误杀关窗后重新 begin 的新进程 |
| 应用 `before-quit` | 先藏窗（体感已退出）→ 等待整理完成 → kill 本应用 llama → `app.exit` |
| 再次进聊天 | `begin` / 下载前先 `awaitChatCloseFinalize`（等 L-delay），再 `reconcileInterruptedLlamaDownloads` |
| 再次点下载 | 同上：先等 L-delay，再 reconcile |

UI：引导遮罩（download_server / download_model）与设置页下载进度均提供「取消下载」。

---

## IPC 入口

| 通道 | 行为 |
|------|------|
| `chat-begin-llama-session` | `beginLlamaChatSession`（单飞） |
| `chat-end-llama-session` | `stopManagedLlamaServer`（立即停；不跑记忆整理） |
| 聊天窗 `closed` | L-delay：整理 → `stopManagedLlamaServer` |
| `chat-probe-local-llama-server` | 仅探测端口，不改 ownership |

---

## 有意设计 / 已知架构特征

| 项 | 说明 |
|----|------|
| 前端 bootstrap「双实例」 | Pet/Home 与 Chat 窗分属 **不同渲染进程**，各有一份 `useChatLlamaBootstrap` UI 状态。这是 Electron 多窗口的正常产物，**不是待修复 bug**。并发 begin / 半成品清理的真相在主进程（单飞锁 + reconcile / cancel）。**禁止**为「跨窗同步遮罩」再造全局 Vue 单例或未决策的 IPC 广播。 |

## 有意不改（其它）

- 下载镜像 / 端口扫描逻辑
- OpenAI API 路径
