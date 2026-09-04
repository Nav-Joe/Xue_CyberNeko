# llama-server 会话生命周期

> **位置：** `electron/main/llama/CONTRACT.md`  
> **对照实现：** `session.ts` · `sessionBootstrapAssets.ts` · `downloadLifecycle.ts` · `modelResolve.ts` · `managedOwnership.ts` · `singleFlight.ts` · `download.ts`（统一入口）· `downloadHttp.ts` · `downloadArtifacts.ts` · `constants.ts`  
> **相关：** `src/services/chat/CONTRACT.md`（本地 bootstrap IPC）

---

## 文件职责（写死）

| 文件 | **只负责** | **禁止塞进** |
|------|------------|--------------|
| `session.ts` | 探测端口 / spawn·waitReady / ownership 内存态 / `begin` 单飞 / `stopManagedLlamaServer`；调用 bootstrap 资产下载 | AbortController、cancel、reconcile、onChatWindowClosed、sweep 编排、GGUF 路径解析、server zip/默认模型下载实现 |
| `sessionBootstrapAssets.ts` | `resolveLlamaServerExe`、`ensureLlamaServerExe`、`downloadDefaultLocalModelFile`、bootstrap 进度桥 | spawn、ownership、begin 单飞、写 chat-config、cancel/关窗 |
| `downloadLifecycle.ts` | abort scope、`reconcileInterruptedLlamaDownloads`、`cancelLlamaDownload`、`onChatWindowClosed`、`afterDownloadAborted`、调用 `download` 统一入口的 sweep | spawn、ownership 赋值、端口探测、写 chat-config、`resolveUsableLocalModelPath` |
| `modelResolve.ts` | `resolveUsableLocalModelPath`、`getLocalModelStatus`；按 `MIN_USABLE_GGUF_BYTES` / `.expected` 清残缺 GGUF | spawn、abort、IPC、写 chat-config |
| `constants.ts` | 含 **`MIN_USABLE_GGUF_BYTES`**（lifecycle 与 modelResolve 共用，禁止各写一份） | 运行时状态 |
| `download.ts` | 再导出统一入口（调用方统一从此 import） | 新业务逻辑（实现放 Http / Artifacts） |
| `downloadHttp.ts` | HTTP probe / 写 partial / 镜像回退 / Abort | zip 解压、模型目录 sweep、IPC、进程生命周期 |
| `downloadArtifacts.ts` | `.partial` / `.expected`、zip 展平、GGUF 列表与 incomplete sweep | HTTP 拉取、Abort 编排、IPC |
| `managedOwnership.ts` | ownership 类型、`decideStopAction` / `decideSnapshotStopAction` / `decideProbeOwnershipReconcile` / `isManagedLlamaRunning` 纯函数 | I/O、下载 |

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
     端口已有（begin 检出        本应用 spawn 成功
     或 probe 对齐）
              │                     │
              ▼                     ▼
        ┌──────────┐          ┌─────────────┐
        │ external │          │ app_spawned │
        └────┬─────┘          └──────┬──────┘
             │                       │
             │ 关聊天窗               │ 关聊天窗：先记忆整理
             │ stop（不 kill）         │ 再只停关窗时记下的进程号
             │ probe 端口不通        │
             │ → 回到 none           │
             ▼                       ▼
                   ┌───────────┐
                   │   none    │
                   └───────────┘

进程 exit 回调（仅当 child === managedProcess）：
  app_spawned → none，清内存 pid，清诊断 pid 文件
```

### 探测对齐所有权（probe）

前端常在「端口已通」时跳过 `begin`。此时主进程若仍是 `none`，关窗快照拿不到 pid，容易留下「端口有服务、内存以为没管」。

| 探测结果 | 当前 ownership | 对齐后 |
|----------|----------------|--------|
| 端口已通 | `none` | → `external`（不 kill、不 spawn） |
| 端口已通 | `external` / `app_spawned` | 不变 |
| 端口不通 | `external` | → `none` |
| 端口不通 | `app_spawned` / `none` | 不变（避免启动中途误清） |

实现：`decideProbeOwnershipReconcile` + `probeLocalLlamaServer` 内应用。

---

## 启停矩阵（谁启谁停）

| 场景 | 启 / 记所有权 | 停 |
|------|----------------|-----|
| 进聊天，端口未通 | `begin` → spawn → `app_spawned`，或检出外部 → `external` | — |
| 进聊天 / 设置切本地，端口已通 | 前端可跳过 `begin`；**probe 把 `none` 对齐为 `external`** | — |
| 设置切到 OpenAI | 只改配置 | **不停** llama |
| 关聊天窗（无下载） | — | 先整理记忆，再 `stop({ onlyPid: 关窗快照 })`；`external` 不 kill |
| 关聊天窗（下载中 / 半成品） | — | `cancelLlamaDownload` → 全量 stop（本应用托管才 kill） |
| 取消下载（聊天仍开） | — | 同上全量 stop（本轮不改为「窗开着就不杀」） |
| 应用退出 | — | 全量 stop |
| IPC `chat-end-llama-session` | — | 立即全量 stop（不跑记忆整理） |

**有意未改（本轮）：** 切 API 不停进程；取消下载在聊天开着时仍可停本应用 llama；多端口全局单实例锁。

---

## 竞态场景 × 动作（锁语义）

> 纯决策在 `managedOwnership.ts`；编排在 `session.ts` / `downloadLifecycle.ts`。  
> **钉表与测即可；禁止为压行数拆 `session.ts` 或改 stop 时序。**  
> `session.ts` 为已知债（约 443/400）：拆文件须另决策且保证 stop/ownership 语义不变。

| # | 场景 | 必须发生 | 禁止 |
|---|------|----------|------|
| 1 | 关窗 L-delay 未结束又 begin | `begin` 先 `awaitChatCloseFinalize`；stop 用关窗 **snapshotPid**（`decideSnapshotStopAction`） | 用「当前 managedPid」无脑全量 kill 新进程 |
| 2 | 关窗后已 spawn 出新 pid | 可杀旧 snapshot；**`clearRuntime=false`**（新进程仍归本应用） | clearRuntime 清掉新 ownership |
| 3 | 前端跳过 begin（端口已通） | probe：`none`→`external` | 关窗把外部进程当 `app_spawned` 误杀 |
| 4 | 设置切 OpenAI | 只改配置 | 顺手 stop/kill llama（有意保留进程） |
| 5 | 全量 stop / 取消下载 / 退出 | `decideStopAction`：仅 `app_spawned`+有 pid 才 kill | 读 `.runtime/llama-server.pid` 决定 kill |
| 6 | 并发 begin | `beginSessionSingleFlight` 只 spawn 一次 | 无锁并行多次 spawn |

护栏测：`managedOwnership.test.ts`（含关窗误杀场景链）+ `createSingleFlight` 并发测。

---

## 人话说明

一句话：**主进程只信内存里的「谁拉起的 + 进程号」；磁盘上的 pid 文件只给人看日志，不参与杀进程。**

- 关窗后立刻再开聊天：会记住关窗那一刻的进程号，整理完只停那个；新开的不会被误杀。  
- 设置里发现「本地服务已经在跑」就不再 begin：探测会把「没管」改成「外部已有」，关窗时不会误当成要杀的本应用进程，也不会假装完全不知情。  
- 切到第三方 API：服务可能还在占端口，这是有意的（省反复冷启动）；再切回本地时靠探测对齐。

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
| `chat-probe-local-llama-server` | 探测端口；按 `decideProbeOwnershipReconcile` **轻量对齐 ownership**（不 kill / 不 spawn） |

---

## 有意设计 / 已知架构特征

| 项 | 说明 |
|----|------|
| 前端 bootstrap「双实例」 | Pet/Home 与 Chat 窗分属 **不同渲染进程**，各有一份 `useChatLlamaBootstrap` UI 状态。这是 Electron 多窗口的正常产物，**不是待修复 bug**。并发 begin / 半成品清理的真相在主进程（单飞锁 + reconcile / cancel）。**禁止**为「跨窗同步遮罩」再造全局 Vue 单例或未决策的 IPC 广播。 |

## 有意不改（其它）

- 下载镜像 / 端口扫描逻辑
- OpenAI API 路径
