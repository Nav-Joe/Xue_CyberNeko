# TTS 服务契约（tts_voice）

与 Electron / 前端对照时另见：

- `electron/main/config/CONTRACT.md` — `.runtime/` 磁盘与 reconcile（A1–A7）
- `src/services/voice-engine/CONTRACT.md` — 加载轮询 + Resync
- `src/services/chat/CONTRACT.md` — 文字聊天 + **对话 TTS 并行真相表（双写）**
- `tts_voice/ENGINE_HOOKS.md` — 引擎 hook / `/tts` 字段一览

---

## Chat TTS parallel（`mode=chat` + `parallel_lanes`）

**实现：** `api/routes/cache_tts.py` → `cache_service.synthesize_tts` → `batch_inference.dispatch_synthesize_chat`。  
**前端对端：** `chatTtsSession` / `ttsPlayer.fetchChatTtsBlob`（请求体含 `order`、`parallel_lanes`）。

### 真相表（与 chat CONTRACT 一致）

| `parallel_lanes` | 后端行为 | `order` |
|------------------|----------|---------|
| **`0`** | 串行有序：`dispatch_synthesize_immediate`，按 order 0→1→2… 推进 | **必须遵守** |
| **`1`** | **同串行**（仅当 `parallel_lanes >= 2` 才进 `ParallelChatPool`）；API **允许** `1`，只文档化，本轮不禁止 | **必须遵守** |
| **`2`–`4`** | `ParallelChatPool`：semaphore 限制并发；GPU 完成顺序任意 | 请求可带 `order`，**池内忽略** |

### 人话说明（与前端同一套约定）

- **串行（lanes 0/1）**：HTTP 可以乱序到，合成仍按 `order` 0→1→2…；前端那「最多约 5 个预取」≠ 五路 GPU。  
- **并行（lanes 2–4）**：最多 lanes 路同时合成；**不管**请求里的 `order`。播放顺序由前端保证。  
- **不要**在并行池里加「必须等上一句合成完」——会和并行打架。  
- 模块文件名带 batch，聊天并行实际走 `ParallelChatPool`，别和触摸 `/tts/batch` 混成一条路。

更完整的流程图与易错点见：`src/services/chat/CONTRACT.md` §人话说明。

### 有意设计，禁止修改

**并行档（`parallel_lanes >= 2`）下：前端仍传递单调递增的 `order`，后端 `ParallelChatPool` 忽略 `order`。**

- **原因：** 展示与口型序由前端队头释放链（`nextReleaseIndex`）保证；若后端再按 order 串行等待，会与并行池死锁或退化为假并行。
- **禁止：** 在 ParallelChatPool / `dispatch_synthesize_chat` 并行分支中恢复「必须等 order-1 完成」；禁止「为对齐字段」删掉前端 `order` 而不改契约与测试。
- **对照测试：** `tts_voice/tests/test_batch_inference.py`（并行完成序可乱序；峰时并发 ≤ lanes）；前端 `chatTtsSession.test.ts`（乱序完成仍按序 reveal；并行在飞 ≤ lanes）。
- **可观测性：** `[TTS/Parallel]` 可打印 `order` 与耗时；**仅日志**，不改变「池内忽略 order」的调度语义。

### 其它边界

- 串行时前端可同时挂最多 **5** 个 HTTP 预取；后端仍 **单路按 order** 推理（5 ≠ 五路 GPU）。
- 并行时前端 **合成在飞数** 必须 **&lt; lanes**（与 semaphore 对齐）；队头未释放时允许后续句合成完成并缓存 blob，软保险 `readyButUnreleased < lanes×3`（写死不进配置）。
- `ParallelChatPool` 将 lanes clamp 到 `[2, 4]`。
---

## 路由与模式（摘要）

| 路径 | 说明 |
|------|------|
| `POST /tts` | body 见 `TtsRequest`；`mode=chat` 走聊天调度（上表） |
| `/touch-mode/sync` 等 | 触摸语料 / 引擎，与 chat parallel **解耦** |

详细引擎行为见 `ENGINE_HOOKS.md`。
