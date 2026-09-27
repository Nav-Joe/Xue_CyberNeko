# 云端 TTS（阿里百炼 · Qwen3-TTS）主进程契约

> **对齐：** `docs/里程碑7-开发规范.md` §云端 TTS · `src/services/chat/CONTRACT.md`  
> **状态：** **C0～C3 + 第 1～3 阶已落地**；云端创造 UX **对齐本地工坊审阅链**。第 4 阶本地权重可选 **未做**。  
> **协议：** 百炼 Qwen3-TTS；enrollment + voice-design + multimodal-generation；主进程 **B1**。VC / VD **可同时配置**；合成按当前音色 `kind` 选对应 model。

## 1. 边界

| 允许 | 禁止 |
|------|------|
| `electron/main/ttsCloud/`：配置、Key、VC/VD、暂存审阅、云语料预热落盘、合成 IPC | 逻辑进 `tts_voice/`；渲染持 Key 或直连百炼；自定义 WAV 路径进渲染 |
| 聊天 / 屏幕陪伴旁白在云端模式下经本模块取音频 | B2；WS；**触摸点击打百炼** |
| Feature：`ttsBackend === 'qwen'` 才走聊天/陪伴合成热路径；默认 **`local`** | 改 local 下 `parallel_lanes` / reconcile / Live2D 口型 |
| 云预热写 `{userData}/tts-cloud-cache/{localVoiceId}/` | 与 `voice_forge` 下 touch_cache 混写 |
| 音色工坊云端页：创造（同本地审阅链）/ 列表 / 快速克隆 / **更新语料（列表选音色）** | 开开关即自动克隆（语义 B） |

## 2. 产品决策（锁定）

| 项 | 决策 |
|----|------|
| 后端枚举 | **`local` \| `qwen`** |
| 双模型 | VC + VD 可同时配置 |
| 云端创造（VD） | 设计 + 语料 → 命名 → 加载遮罩 → **审阅弹窗试听** → 确认 → **预热落盘**（复用本地 Boot/Review UI） |
| 暂存 | `stageOnly` 设计结果进 `{userData}/tts-cloud-pending/`，**确认前不写入** `voices[]` |
| 云语料预热 | **每句 1 条** wav；目录按 `voices[].id` 隔离 |
| 触摸（云端模式） | 只读云缓存；**未命中静默跳过**（不打百炼、不回落侧车） |
| 预热成功 | 写入语料快照 + 切触摸为 `custom_corpus`（与本地预热同语义） |
| 快速克隆（VC） | 可直接入库（不等同创造审阅链）；完整审阅链以 VD 创造为准 |
| 更新语料 | 与本地一致：列表选择已有云端音色 → 编辑其独立语料 → 用该音色绑定的 Bailian voice 预热 |
| 本地权重可选 | **第 4 阶** |

## 3. 配置与缓存落盘

- 配置：`tts-cloud-config.json`（同前）
- 暂存：`{userData}/tts-cloud-pending/pending.json` + `preview.wav`
- 云缓存根：`{userData}/tts-cloud-cache/`
- `localVoiceId` 字符集：`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$`；解析后路径必须落在 `tts-cloud-cache/` 下（拒绝 `..` 等穿越）
- 单音色：`{root}/{localVoiceId}/corpus.snapshot.json`、`touch_cache.json`、`cache/manifest.json`、`cache/{textKey}/0.wav`
- `textKey` = `sha256(line.trim())[:16]`（对齐本地策略）
- `variant_count = 1`；`backend = qwen-cloud`

## 4. 合成与音色语义

- VC / VD / 合成：同前
- 预热合成：主进程串行调 multimodal-generation（不要求已切 `ttsBackend=qwen`）
- 触摸：`speakText` 在 `ttsBackend===qwen` 时只走 `tts-cloud-get-cache-audio`

## 5. IPC

| Channel | 说明 |
|---------|------|
| 前序 get/set/enroll/design/remove/preview/synthesize | 同第 2 阶；`design` 支持 `stageOnly` + `corpus` |
| `tts-cloud-get-pending-preview` | 审阅弹窗读暂存预览 wav |
| `tts-cloud-get-pending-status` | 启动恢复：是否有待审阅云端创造 |
| `tts-cloud-approve-pending` | 入库 voices + 写语料快照，清暂存 |
| `tts-cloud-reject-pending` | `regenerate` / `skip`：先清暂存并立刻返回（`regenerate` 带回 pending 参数）；远端删除异步 best-effort，不阻塞重新设计 |
| `tts-cloud-get-corpus` | 读某音色云语料快照 |
| `tts-cloud-prewarm-corpus` | 保存语料并预热落盘 |
| `tts-cloud-get-cache-audio` | 触摸读盘（miss → ok:false） |

## 6. 创造链路（渲染）

```
CloudCreateTab（复用 CreateTab 表单）
  → cloud-voice-forge-start
  → Boot overlay (cloud_create / generating)
  → designTtsCloudVoice(stageOnly)
  → ReviewDialog (backend=cloud)
  → approve：ReviewDialog → voiceForgeReviewBridge → prewarming 遮罩 → approve-pending + prewarm → ready
  → regenerate：ReviewDialog → voiceForgeReviewBridge → generating 遮罩 → reject + 重跑 design
```

## 7. 阶梯

| 阶梯 | 状态 |
|------|------|
| 第 1～3 阶 | **已落地** |
| UX 对齐本地创造审阅链 | **已落地** |
| 第 4 阶 本地权重可选 | **后置** |
| B2 / WS | **Pass / 后置** |

## 8. 测试

配置迁移、VC/VD、`stageOnly` 暂存/approve/reject、预热写盘与命中/跳过、触摸云 miss 不打合成。

## 9. Out of Scope

- 触摸实时打百炼、本地权重可选安装、B2/WS、Fish/MiniMax  
- 快速克隆走完整审阅链（可后补）
