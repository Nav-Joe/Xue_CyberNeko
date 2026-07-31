# Relationship 三维好感 — CONTRACT

> **位置：** `electron/main/relationship/`  
> **拥库表：** `relationship_states` / `relationship_events`（`electron/main/memory/schema.ts`，同一 `memory.db`）

## 边界

- **允许：** 读写本两表；阶段 TAG / Δ 钳制；轮后/关窗鉴定；system 注入；只读 UI  
- **禁止：** 读写 Desire 表；把 DB 句柄交给 LLM；前端直接改分；改 TTS / Live2D  
- **与 Desire：** 引擎解耦；**UI 总闸绑定**：好感随「官方情感模拟插件」（`desireEnabled`）同开同关；配置里 `relationshipEnabled` 随插件开关同步写入  
- **关插件：** **不**清零、**不**删 `relationship_states` / `relationship_events`；分数与流水保留，仅停止鉴定/注入/摸摸加亲近，直至重新开启

## 表结构

| 表 | 约定 |
|----|------|
| `relationship_states` | 全局单行 `id='default'`；`closeness` / `trust` / `rapport` ∈ [-10, 10]；迁移种子全 0 |
| `relationship_events` | 变更流水（供今日净变化等统计） |

## 纯函数引擎

| 项 | 约定 |
|----|------|
| 模块 | `types.ts` + `engine.ts`；**不**读写 DB |
| 程度 → \|Δ\| | micro **0.01** / medium **0.05** / high **0.1** / extreme **0.5** |
| apply | `sign × Δ`；改完 clamp `[-10,10]`；可多维同包；**同维可叠加** |
| 事件草稿 | 记**原始** delta（顶满仍记提议量）；非法 dim/magnitude/sign → **整条 skip** |
| TAG | 七档；默认 `(L,R]`；`v≤-7.5` 含 -10 为最低档；「正常」可省略特殊语气 |
| 被动衰减 | **无** |

## LLM 鉴定与写库

| 项 | 约定 |
|----|------|
| 门控 | `memory ready && memoryEnabled && desireEnabled`（插件总闸） |
| 节拍 | 渲染侧会话缓冲：满 **3** 轮 `source=llm_turn`；关窗把剩余轮立刻送检 `source=chat_close` |
| 缓冲 | **不**按 raw_logs 计数；发起 IPC 即清空批次（LLM 失败不回灌） |
| LLM | 独立小调用；只出 `changes[]` 枚举（sign ±1 + magnitude）；禁止自造 TAG/数字 Δ |
| 写库 | `parse` → `applyRelationshipDeltas` → 写 `relationship_states` + 插 `relationship_events` |
| IPC | `relationship-get-status` / `relationship-apply-eval` |
| 热路径 | 渲染侧后台调用；不阻塞 sending / 首 token |

## System 注入

| 项 | 约定 |
|----|------|
| 门控 | 同「LLM 鉴定与写库」 |
| 时机 | 发消息前只读；**不**改分、**不**调鉴定 LLM |
| 块头 | `【当前关系姿态（情感模拟）】` |
| 内容 | 三维当前分 + TAG；「正常」不加提示句；非正常用 `RELATIONSHIP_TAG_HINTS` |
| 全正常 | **仍注入**简档三行 |
| system 顺序 | 角色卡 → 时间 → memory → desire → **relationship** |
| IPC | `relationship-get-prompt-block` |

## 只读 UI

| 项 | 约定 |
|----|------|
| 入口 | 家窗口「好感度」按钮（类记忆空间全屏面板） |
| 开关 | **无独立子开关**；与「官方情感模拟插件」同开同关（V0.1.0）；关则家窗 **隐藏**好感入口；**数据保留停滞**（不清库） |
| 展示 | SVG 雷达 + 三维条（−10～+10）+ TAG；**今日**净变化（本地 0 点起；按原始 delta 求和） |
| 窗口 | 本地日历日（非滚动 24h）；无事件则「今日无调分」 |
| IPC | `relationship-get-snapshot`（字段 `netToday`） |
| 禁止 | 前端写分 |

## 维度（字段名）

| 中文 | 字段 |
|------|------|
| 亲近 | `closeness` |
| 信任 | `trust` |
| 投契 | `rapport` |

业务规则细节见 `docs/里程碑4-开发规范.md` §5.6；以本 CONTRACT 为准。
