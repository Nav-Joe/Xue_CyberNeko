# 摸摸计数 — CONTRACT

> **位置：** `electron/main/petTouch/`  
> **拥库表：** `pet_touch_daily`（`memory.db`）

## 边界

- **允许：** 按本地日历日记部位触摸；可选授予亲近；家窗只读展示  
- **禁止：** 改 TTS / Live2D 调度；改信任/投契  
- **与情感插件：** 计数 **不** 看开关；加亲近须 `memoryEnabled && desireEnabled`

## 计数

| 项 | 约定 |
|----|------|
| 日界 | 本地 **0 点**（`day_key=YYYY-MM-DD`） |
| 部位 | `head` / `arms` / `body` / `legs` / `tail` |
| 触发 | 任意模式成功解析部位即记 1（与 TTS/语料无关） |
| UI | 家窗「今日摸摸状况」 |

## 可选加亲近

| 项 | 约定 |
|----|------|
| 加分 | 每次授予 `closeness += 0.01`（micro）；仅亲近 |
| 封顶 | 全日合计 **10** 次（`affection_grants`）；满后仍可摸、不加分 |
| 门控 | 加亲近：记忆总闸 + 官方情感模拟插件；关则只计数、家窗不显示加分进度 |
| 家窗好感 | 关插件时 **隐藏**「好感度」入口（与 `desireEnabled` 同步） |
| 流水 | `relationship_events.source = pet_touch`；记原始 delta |

## Prompt 注入

| 项 | 约定 |
|----|------|
| 时机 | 发消息前只读，并入聊天 system（**不**另开 LLM） |
| 门控 | 须记忆总闸（与记忆读路径同开）；**不**绑情感插件（关插件仍注入摸摸次数） |
| 内容 | 合计 + 五部位次数（**不含**亲近加分进度） |
| 顺序 | memory → desire → relationship → **petTouch** |
| IPC | `pet-touch-get-prompt-block` |
