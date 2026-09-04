# Desire 引擎 — CONTRACT

> **位置：** `electron/main/desire/`  
> **拥库表：** `desire_states`（`electron/main/memory/schema.ts`，同一 `memory.db`）

## 边界

- **允许：** 重逢升血、轮扣、Top-N 注入；轮后解析 LLM 提议并写库  
- **禁止：** 把 DB 句柄交给 LLM；改 TTS / Live2D；本目录写 Relationship  
- **多欲望：** 逐条判定；单次提议最多 **create 1** 条  

## 衰减（已拍板）

| 项 | 规则 |
|----|------|
| ignored / neutral / advanced | \(-3d\) / \(-1d\) / \(+5d\)；intensity 不进 \(\Delta\) |
| 保护期内 ignored | \(-0.5d\)；禁止 urgent |
| 墙钟 | 只升不降（12h / 3d + 保护 3 轮） |

## 发消息前（注入）

须记忆就绪且记忆/欲望开关均开。流程：重逢升血 → Top-N → 写入 system（接在 memory 之后）。本路径不轮扣、不自动创建欲望。

## 轮后鉴定

| 项 | 约定 |
|----|------|
| 时机 | 一轮结束后后台独立小调用（`desire-apply-after-turn`），不阻塞发送 |
| 调度 | 渲染 `maybeDesireAfterTurnInBackground` → `scheduleMemoryBackground`（**禁止 await**）；**不进** memory `consolidateChain` |
| 与满轮总结 | 可与 `maybeConsolidateOnRoundCap` **并行**抢同一聊天 LLM（尤其本地）——抢模型 ≠ 互 await 死锁；禁止在 `chatTurnAftermath` 里 `await` 本 IPC |
| 有 open | **每轮**跑鉴定（outcome / fulfill / keep…） |
| 无 open | 助手回复命中自我欲关键词（连续串+滑窗）才跑；只扫 assistant |
| 未提及的 open | 默认 **neutral** 轻扣 |
| keep | 可调 intensity；patienceMax **硬钳 1～200**（小幅靠 prompt） |
| create | 单次最多 1；Remaining:=Max |
| 铁律 | 禁止把用户愿望写成欲望名 |
| 失败 | 整包 noop，不拖聊天 |

关键词表见 `trigger.ts` 的 `DESIRE_SELF_TRIGGER_PHRASES`（**仅强命中**，避免「你想吃」误触发）。

## 默认假设

1. 有活跃欲望时，同包仍允许最多 **1** 条 `create`（并行多欲）  
2. `patienceMax` 硬钳 **1～200**；「小幅」靠鉴定 prompt，不做相对幅度硬限制  
