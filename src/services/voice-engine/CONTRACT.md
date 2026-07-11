# Voice Engine Load 策略契约

`src/services/voice-engine/` 负责 Pet 窗口语音加载遮罩的轮询逻辑（`waitForVoiceEngineLoad`）。  
入口 IPC `beginVoiceEngineLoad` 在 Electron 主进程 → `PetApp.runVoiceEngineLoad`；本模块仅处理 TTS health/cache 轮询。

## 策略一览

| mode | 典型场景 | expectedTouchMode |
|------|---------|-------------------|
| `curated` | 切回精选触摸音频 | `curated` |
| `engine` | 切换声线（克隆引擎挂载） | `custom_corpus` |
| `prewarm` | 保存并预热语料 / 第三方语料 | `custom_corpus` / `curated` / `alt_engine_corpus` |
| `realtime` | 开启触摸实时推理 | `custom_corpus` |

---

## curated

### 完成条件

- `health` 存在
- `health.sync_running === false`
- `health.touch_mode === 'curated'`

### Abort 条件

| reason | 条件 |
|--------|------|
| `touch_mode_mismatch` | sync 结束后 touch_mode 仍 ≠ expected，超过 grace |
| `sync_stuck` | `sync_running` 持续 > 180s |
| — | **不**触发 `engine_mount_timeout`（curated 跳过引擎挂载等待） |
| — | **不**触发 `prewarm_stuck` |

### 典型文案

| 状态 | 文案 |
|------|------|
| sync 中 + 有 syncMessage | 调用方传入的 syncMessage |
| sync 中 + 无 syncMessage | 正在切换声音喵~ |
| sync 结束、未完成 | 正在切换为精选触摸音频… |

---

## engine

### 完成条件

- `health.sync_running === false`
- 若 `expectedTouchMode === 'curated'`：`health.touch_mode === 'curated'`（边界路径）
- 否则：
  - `health.touch_mode === expectedTouchMode`
  - `health.engine === true`
  - `health.engine_matches_active === true`
- **不要求** cache 全库 `ready`（语料可后台继续预热）

### Abort 条件

| reason | 条件 |
|--------|------|
| `touch_mode_mismatch` | 共享 |
| `sync_stuck` | 共享 |
| `engine_mount_timeout` | sync 结束 > 20s grace，engine 未挂载，且 `cacheLooksReadyOnDisk` 为 true |

### 典型文案

| 状态 | 文案 |
|------|------|
| sync 中 | syncMessage ?? 正在切换音色喵~ |
| engine 就绪 + cache building | 克隆引擎已就绪，后台预热语料中… |
| engine 就绪 | 克隆引擎已就绪 |
| 其它 | 正在连接语音服务… |

---

## prewarm

### 完成条件

**路径 A：`expectedTouchMode === 'curated'`**（官方精选 + 语料预热）

- `!sync_running`
- `!isPrewarmStillRunning`
- `!cache.building`
- `progress.done >= prewarm_work_total`（当 work_total > 0）
- `health.touch_mode === 'curated'`

**路径 B：`custom_corpus` / `alt_engine_corpus`**

- `health.touch_mode === expectedTouchMode`
- engine 已挂载且 matches active
- `!isPrewarmStillRunning`
- `!cache.building` 且 `!cache.stale`
- `cache.ready` **或** progress 已满（竞态兜底）

**Resync：** sync 结束且无 prewarm 活动、cache 未 ready/building 时，重打 `/touch-mode/sync` 以消费 `.runtime/corpus-prewarm.flag`（Python `consume_corpus_prewarm_flag`）。

### Abort 条件

| reason | 条件 |
|--------|------|
| `touch_mode_mismatch` | 共享 |
| `sync_stuck` | 共享 |
| `engine_mount_timeout` | 共享（非 curated mode） |
| `prewarm_stuck` | sync 曾运行、结束 > 120s，cache 未 ready、未 building、无 prewarm 活动 |

> `prewarm_stuck` 当前由 `index.ts` + `load-abort.ts` 判定；`prewarm-mode.execute.abort` 保留为 `null`，便于后续移入 mode 内部。

### 典型文案

| 状态 | 文案 |
|------|------|
| sync 中 | syncMessage ?? 正在预热语料库喵~ |
| 预热进度 | 正在预热语料缓存 {done}/{total}… |
| engine 就绪 | 克隆引擎已就绪 |
| 其它 | 正在连接语音服务… |

---

## realtime

### 完成条件

与 **engine** 相同：克隆引擎挂载即可，不要求 cache 全 ready。

### Abort 条件

与 **engine** 相同（含 `engine_mount_timeout`）。

### 典型文案

| 状态 | 文案 |
|------|------|
| sync 中 | 正在切换实时推理喵~（**不**使用 syncMessage） |
| engine 就绪 + cache building | 实时推理已就绪，后台预热语料中… |
| engine 就绪 | 实时推理已就绪 |
| 其它 | 正在连接语音服务… |

---

## 共享 Abort 常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `POLL_INTERVAL_MS` | 800 | 轮询间隔 |
| `LOAD_TIMEOUT_MS` | 600_000 | 总超时 |
| `SYNC_STUCK_MS` | 180_000 | sync_running 卡住 |
| `ENGINE_MOUNT_GRACE_MS` | 20_000 | 引擎挂载 grace |
| `PREWARM_STUCK_MS` | 120_000 | 语料预热无进展 |
| `TOUCH_MODE_MISMATCH_GRACE_MS` | 3_000 | sync 后 touch 漂移 grace |
| `TOUCH_MODE_MISMATCH_ABORT_MS` | 15_000 | 从未 sync 时的硬超时 |
| `RESYNC_INTERVAL_MS` | 2_500 | 重 sync 最小间隔 |
| `MAX_RESYNC_ATTEMPTS` | 12 | resync 次数上限 |
| `RESYNC_COOLDOWN_MS` | 3_000 | 两次 resync 最小间隔 |
| `POST_SYNC_GRACE_MS` | 2_000 | sync 刚结束后的判定 grace |

---

## Resync 防御规则（corpus-prewarm.flag 竞态）

Electron 写入 `.runtime/corpus-prewarm.flag` 后，前端通过 `/touch-mode/sync` 触发 Python `consume_corpus_prewarm_flag()`。若 sync 刚结束就立刻用旧 snapshot 判 complete/abort，可能误触 `prewarm_stuck`。

### 时序

1. `pollHealthAndCache()` 拉取 health + cache
2. `LoadTimingTracker.observeHealth()` 检测 `syncJustFinished`（`sync_running` 下降沿）
3. `maybeResync()` 判断是否重打 sync（见下三道保险）
4. 若 `didResync === true` → **本轮 `continue`**，跳过策略 complete/abort
5. 否则 `strategy.execute()` 正常判定

### 三道 resync 保险（`maybeResync`）

| # | 条件 | 目的 |
|---|------|------|
| ① | `resyncCount >= MAX_RESYNC_ATTEMPTS` | 防 resync 风暴 |
| ② | 距上次 resync < `RESYNC_COOLDOWN_MS` | 冷却，独立于 `RESYNC_INTERVAL_MS` |
| ③ | `syncJustFinished` 且距 `syncFinishedAt` < `POST_SYNC_GRACE_MS` | 给 flag 消费留窗口，此间不 resync |

resync 成功后 `resetAfterResync()` 重置 sync 计时；`resyncCount` 累计不重置。

### 与策略接口的关系

- `VoiceEngineLoadStrategy.execute` 仍返回 `requestResync`（prewarm 侧文档化用）
- 实际 resync 触发与防御均在 `health-monitor.maybeResync`，策略 poll/abort 逻辑不变

## 相关文档

- TTS 侧行为：`tts_voice/ENGINE_HOOKS.md`
- 磁盘 flag 契约：`electron/main/config/CONTRACT.md`
