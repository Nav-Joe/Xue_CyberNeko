# 雪澜赛博猫娘（Xue_CyberNeko）

一个会动、会聊、会悄悄观察你的 Live2D 桌面 AI 桌宠。

**当前版本：V0.5.1（早期开发版本）**

> **文档语言 / Docs:** [中文 README](README.md)（本页）· [English README](README.en.md)

## 项目前提须知

这个项目是我和 Cursor Agent 联合打造的，存在纯粹是因为我想做它。

我把 Cursor 当搭档用：我负责架构设计、技术选型、功能定义和核心代码审查，Cursor 处理实现细节、样板代码和重复劳动。相当于和一个打字飞快、什么框架都懂的程序员结对编程。

所有的测试和 AI 生成的代码我都会进行人工测试和人工审查，保证项目质量。如果你是古法编程爱好者，也请不要嫌弃这个项目，谢谢喵~

## ⚠️ 提醒

本次开发均以桃濑日和的 pro 版 Live2D 模型进行测试和开发。如果你想自己更换模型，可能会有 BUG，请自行解决！

## 重大更新

### 记忆（里程碑 4 已上线）

- 现在雪澜已经可以记住你与她的故事~
- 雪澜不仅可以记住你与她的回忆，还能做到深深记住你与她的重要时刻~
- **记忆空间：** 可以通过记忆空间来看看雪澜的记忆和小心思，但是注意不要被她发现啦~
- **用户画像：** 随着你们故事的发展，你的模样在雪澜心中会越来越清晰，让雪澜越来越熟悉你，理解你~
- **时间感知：** 现在雪澜有完整的时间观念。
- **开关位置：** 桌宠右键 → 设置 →「记忆与情感」（聊天窗设置里不再放记忆开关）

### 官方情感模拟插件 V0.1.0（里程碑 4.5 首版）

- **欲望模拟系统：** 聊天时会把角色当下的小心思带进对话；聊完后在后台悄悄更新，不拖慢你说话
- **三维好感度系统：** 亲近 / 信任 / 投契，默认都从 0 开始；家窗口可打开「好感度」面板查看
- **摸摸：** 点到身体部位会记今日次数；记忆与情感插件都开时，有机会小幅加亲近（每天有上限）
- 关插件**不会清掉**已有好感数据，只是暂时停更；需要先开记忆，才能开本插件

## 🚧 里程碑进度

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **0** | Electron + Vue 3 + TypeScript 骨架 | ✅ |
| **1** | 桌宠窗、Live2D、右键菜单、「家」窗口 | ✅ |
| **2** | 语料库 + 多引擎 TTS + 音色工坊 + 精选音频 | ✅ |
| **3** | 文字聊天 + llama.cpp + OpenAI API + 对话 TTS | ✅ |
| **4** | 记忆基座与检索（无向量）；**4.5** 自研情感模拟 | 🔧 **4 ✅** / **4.5** 首版插件 ✅ |
| **5** | 聊天窗语音输入（STT） | ✅ |
| **6** | 主动行为 & 屏幕感知 | ⬜ |
| **7** | 设置完善 & 打包发布 | ⬜ |

## 环境要求

- **Windows 10/11**（当前脚本以 Windows 为主）
- **Node.js 20+**、**Python 3.10+**（`首次安装.bat` 可自动安装；默认锁定 **Node 24.16.0**、**Python 3.10.10**，见 `scripts/win/runtime-versions.cmd`）
- TTS 依赖装进项目 **`.venv`**，不污染系统 Python
- **Git**（可选，克隆 Bert-VITS2 等）
- **文字聊天（本地模式）**：首次使用会自动下载 llama-server 与默认 GGUF（约 2 GB，见 `llama_models/`）

## 快速开始

1. 双击 **`首次安装.bat`**（只需一次：npm、Live2D 模型、Python `.venv`、TTS/STT pip 依赖、SenseVoice / Qwen 模型）
2. 双击 **`启动.bat`**（TTS 窗口 + 桌宠；关闭桌宠后 TTS 一并退出）
3. **家窗口 → 文字聊天**，或桌宠旁聊天快捷按钮

命令行等价：

```bash
npm install
npm run setup:model    # 下载 Live2D 官方 hiyori_pro 样例
npm run dev            # 仅桌宠（需另开 TTS，见下）
npm run tts            # 仅 TTS 服务
npm test               # 前端 vitest
npm run test:memory    # 记忆库集成测（临时 Node ABI → 测完恢复 Electron）
npm run test:tts       # Python pytest（tts_voice/tests）
```

成功效果：桌面透明窗显示 Live2D 猫娘；右键 → **回家** 打开中央「家」窗口。

### 文字聊天简要说明

| 模式 | 说明 |
|------|------|
| **本地 llama** | 进入聊天或设置内切到本地时，检测 llama-server；未运行则引导下载 / 启动；关闭聊天窗会结束本应用启动的 llama 进程 |
| **第三方 API** | 聊天设置中填写 Base URL、模型名、API Key；请求经主进程 IPC 代理 |
| **语音输入（STT）** | 聊天设置中开启；点麦说话 → 结束 → 填入输入框或自动发送（默认关；连续通话式体验后置） |

会话气泡默认仍只在本窗内存；在桌宠设置里开启 **记忆** 后，对话会写入 `%APPDATA%/xue-cyber-neko/memory.db`（即 Electron `{userData}/memory.db`，关窗异步整理）。记忆关闭时，聊天行为与早期纯文字聊天阶段一致。

### 隐私与本地数据（务必知晓）

对话原文、总结、用户画像、欲望/好感流水、API Key 等**只应留在本机**。`.gitignore` 已挡住常见误提交路径；请勿把它们复制进仓库或贴到 Issue：

| 本机路径（Windows 示意） | 内容 |
|--------------------------|------|
| `%APPDATA%/xue-cyber-neko/memory.db` | 对话原文、日常/周/月总结、核心记忆、用户画像；以及欲望、三维好感、今日摸摸等（同一库） |
| `%APPDATA%/xue-cyber-neko/chat-config.json` | LLM / TTS / 记忆与情感开关；**API Key 仅主进程落盘** |
| `%APPDATA%/xue-cyber-neko/character-cards.json` | 你的角色卡（人设等） |

仓库里**可以**有的，只是：schema / 迁移 SQL、默认角色卡模板、模块契约（无真实密钥）。开发临时库在 `.runtime/memory*.db`（已忽略）。

### 常见问题

**`启动.bat` 闪退：** 在 PowerShell 中运行 `cmd /k .\启动.bat` 查看完整报错。

**Electron 未安装完整：** `npm rebuild electron` 或删除 `node_modules` 后重新 `npm install`（项目 `.npmrc` 已配国内镜像）。

**记忆库 `better-sqlite3` / NODE_MODULE_VERSION 报错：** 原生模块需对齐 Electron（不是系统 Node）。执行 `npm run rebuild:native`（`npm install` / 首次安装的 postinstall 也会自动重编）。

**窗口一片空白：** 执行 `npm run setup:model` 补全 Cubism Core 与模型文件。

**本地聊天连不上：** 查看 `.runtime/logs/llama-server.stderr.log`；8080 被占用时可关闭冲突程序或让应用自动换端口。

## 触摸语音（里程碑 2）

### 三种反馈模式

| 模式 | 说明 | 适用引擎 |
|------|------|----------|
| **精选音频** `curated` | 播放 `public/touch_clips/` 内 wav | 任意 |
| **音色工坊语料** `custom_corpus` | 编辑语料 → Qwen 克隆预热 → 点击播放缓存 | **qwen** |
| **第三方引擎语料** `alt_engine_corpus` | 编辑语料 → 当前私有引擎预热 | **bert_vits2** 等 |

UI 以 TTS `/health` 的**运行中 backend** 为准。

### 触摸实时推理

入口：**桌宠右键 → ⚙️ 设置 → 高级功能**。

| 状态 | 行为 |
|------|------|
| **关闭**（默认） | 优先预热缓存；未预热句可 fallback 实时合成 |
| **开启** | 每次点击实时 TTS，不读预热 wav |

开关写入 `.runtime/realtime-inference.env`（本地，不入库）。

### 语料库在哪里？升级后如何迁移？

触摸语料的**内置默认**在仓库内 `src/data/corpus.json`（随新版本更新即可，一般无需手动拷贝）。

你在音色工坊 / 语料编辑器里**保存过的自定义内容**写在项目根目录下：

| 路径 | 内容 | 升级时建议 |
|------|------|------------|
| `.runtime/corpus.custom.json` | **当前生效的触摸语料**（按 head/arms/body/legs/tail 分句） | ✅ **必拷** |
| `.runtime/touch-mode.env` | 触摸模式（精选 / 音色工坊 / 第三方引擎语料） | ✅ 建议拷 |
| `.runtime/voice-forge.json` | 当前激活声线、instruct 覆盖等 | ✅ 建议拷 |
| `voice_forge/custom_sample/{声线id}/` | 自定义克隆声线（参考音 + 语料快照 + 预热缓存） | ✅ 整目录拷 |
| `voice_forge/default_sample/corpus.snapshot.json` | 官方默认声线下的语料快照 | 若曾改过官方声线语料则拷 |
| `voice_forge/other_custom_cache/{引擎名}/` | 第三方引擎（如 bert_vits2）语料与缓存 | 若使用该引擎则拷 |

**手动迁移步骤（无需软件自动找旧版目录）：**

1. 关闭旧版本的 TTS 窗口与桌宠  
2. 将上表中标 ✅ 的文件 / 文件夹，复制到**新版本项目根目录的相同路径**  
3. 重新运行 `启动.bat`

说明：语料 JSON 结构与 `src/data/corpus.json` 相同；只要 major 版本未改字段，通常可直接沿用。第三方引擎语料还需一并保留 `tts_voice/bert/` 等私有权重（见 `.gitignore` 与 `tts_voice/ENGINE_HOOKS.md`）。

### TTS 引擎

配置：`tts_voice/config.yaml`（改 `engine` 后**重启 TTS**）。

| 引擎 | 说明 |
|------|------|
| `qwen` | **默认**。VoiceDesign + Base 1.7B；音色工坊 |
| `bert_vits2` | 需 `Bert-VITS2/` + 私有权重 |
| `style_bert_vits2` | 占位，欢迎 PR / Issue |

详细对接：`tts_voice/ENGINE_HOOKS.md`。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式桌宠 |
| `npm run build` | 打包应用 |
| `npm run setup:model` | 下载/补全 Live2D hiyori_pro |
| `npm run typecheck` | Vue/TS 类型检查 |
| `npm test` | Vitest 单元测试 |
| `npm run test:memory` | 记忆 SQLite 集成测（Node 重编 → 跑测 → 恢复 Electron ABI） |
| `npm run test:tts` | TTS Python 测试 |
| `npm run tts` | 仅启动 TTS |

## 项目结构（核心）

```
Xue_CyberNeko/
├── electron/                 # 主进程、preload、IPC、llama 会话
│   ├── main/chat/            # 聊天窗、chat-config、OpenAI 代理
│   ├── main/memory/          # 记忆引擎、schema、迁移（无用户数据）
│   ├── main/desire/          # 欲望引擎
│   ├── main/relationship/    # 三维好感
│   ├── main/petTouch/        # 摸摸计数（可选加亲近）
│   └── main/stt/             # 语音输入侧车代启 / 停托管
├── src/
│   ├── components/chat/      # 聊天 UI、TTS/LLM/STT/角色卡设置
│   ├── components/memory/    # 记忆空间面板
│   ├── components/relationship/  # 好感度面板
│   ├── components/petTouch/  # 今日摸摸卡片
│   ├── composables/chat/     # 会话、入口、bootstrap、语音输入
│   └── services/
│       ├── chat/             # LLM、TTS 流水线、角色卡
│       ├── stt/              # 语音识别客户端、采音、选麦
│       ├── memory/           # 记忆 IPC 客户端
│       ├── desire/           # 欲望 IPC 客户端
│       ├── relationship/     # 好感 IPC 客户端
│       └── petTouch/         # 摸摸 IPC 客户端
├── memory_service/           # 可选独立服务（总结相关，无用户库）
├── stt_service/              # 本机 STT 侧车（语音 → 文字）
├── tts_voice/                # FastAPI TTS + engines
├── voice_forge/              # 音色工坊样本
├── scripts/                  # 安装、启动、benchmark、记忆测脚手架
├── public/models/            # Live2D（setup:model 下载）
├── public/touch_clips/       # 精选触摸 wav
├── 首次安装.bat
├── 启动.bat
└── package.json
```

## 公开文档索引

| 文档 | 说明 |
|------|------|
| [`README.md`](README.md) | 中文 README（本页） |
| [`README.en.md`](README.en.md) | English README |
| [`tts_voice/ENGINE_HOOKS.md`](tts_voice/ENGINE_HOOKS.md) | TTS 引擎对接、缓存、config.yaml |
| [`tts_voice/CONTRACT.md`](tts_voice/CONTRACT.md) | TTS 服务契约 |
| [`src/services/chat/CONTRACT.md`](src/services/chat/CONTRACT.md) | 聊天模块契约 |
| [`stt_service/CONTRACT.md`](stt_service/CONTRACT.md) | 语音输入（STT）侧车契约 |
| [`electron/main/stt/CONTRACT.md`](electron/main/stt/CONTRACT.md) | STT 代启 / 停托管契约 |
| [`electron/main/chat/CHAT_CONFIG.md`](electron/main/chat/CHAT_CONFIG.md) | chat-config 字段说明（无真实 Key） |
| [`electron/main/memory/CONTRACT.md`](electron/main/memory/CONTRACT.md) | 记忆模块契约（库表 / IPC / 召回；无用户数据） |
| [`electron/main/desire/CONTRACT.md`](electron/main/desire/CONTRACT.md) | 欲望模块契约 |
| [`electron/main/relationship/CONTRACT.md`](electron/main/relationship/CONTRACT.md) | 三维好感契约 |
| [`electron/main/petTouch/CONTRACT.md`](electron/main/petTouch/CONTRACT.md) | 摸摸计数契约 |
| [`public/models/README.md`](public/models/README.md) | Live2D 模型替换 |
| [`voice_forge/README.md`](voice_forge/README.md) | 音色工坊目录 |
| [`public/touch_clips/README.md`](public/touch_clips/README.md) | 精选音频 manifest |

## 许可证

MIT（里程碑 7 发布前正式确认）

## 关于下一阶段

情感模拟首版已经可用；接下来会继续打磨它，并计划STT（语音转文字）功能。

## 赞助

项目免费开源，后续将开放投喂渠道，欢迎 Star 与 Issue。

## 一些悄悄话

实际开发中可能会根据使用体验更换技术栈或架构，里程碑表格里的技术栈仅作方向参考——开发过程往往是想到什么就做什么......
