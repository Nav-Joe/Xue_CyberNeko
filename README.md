# 雪澜赛博猫娘（Xue_CyberNeko）

一个会动、会聊、会悄悄观察你的 Live2D 桌面 AI 桌宠。

## 项目前提须知

这个项目是我和Cursor Agent联合打造的，这个项目存在，纯粹是因为我想做它，就这么简单。
我把 Cursor 当搭档用。我负责架构设计、技术选型、功能定义和核心代码审查，Cursor 处理实现细节、样板代码和重复劳动。相当于和一个打字飞快、什么框架都懂的程序员结对编程。
所有的测试和AI生成的代码我都会进行人工测试和人工审查，保证项目质量。
如果你是古法编程爱好者，也请不要嫌弃这个项目谢谢喵~

## ⚠️ 提醒：
本次开发均以桃濑日和的pro版Live2D模型进行测试和开发，如果你想自己更换模型，可能会有BUG，请自行解决！

## 重大更新已上线！
里程碑2上线的具体可实现的内容如下，已上线并通过个人总体测试，如有BUG欢迎PR或者提Issue！

**音色工坊：** 内置Qwen3.0_tts引擎，可根据提示词生成你喜欢的声音！自定义程度拉满！并且用户可创建多个声音配置！

**自定义语料库：** 可以自定义触摸时的语料库，猫娘被触碰后说出的话完全由你来决定！

**实时推理功能：** 想要让猫娘的每句话不再是机械般的只调用预热好的音频？启动实时推理让猫娘更鲜活（但是注意这会不可避免的出现比较高的延迟，适合接受这方面延迟的玩家）

**TTS引擎切换：** 如果不想用Qwen3.0_tts可以通过共用接口对接你喜欢的TTS引擎！

## 🚧 当前施工进度

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **0** | Electron + Vue 3 + TypeScript 骨架 | ✅ |
| **1** | 桌宠窗、Live2D、右键菜单、「家」窗口 | ✅ |
| **2** | 语料库 + 多引擎 TTS + 音色工坊 + 精选音频 | ✅ |
| **3** | 文字聊天 + Ollama | ⬜ |
| **4** | 记忆（RAG + 总结） | ⬜ |
| **5** | 语音连续对话（STT + TTS） | ⬜ |
| **6** | 主动行为 & 屏幕感知 | ⬜ |
| **7** | 设置完善 & 打包发布 | ⬜ |

**里程碑 2 要点：** 部位语料、点击抽句、默认 Qwen3-TTS、触摸精选 wav、音色工坊克隆、第三方引擎语料、语料增量预热缓存、触摸实时推理。

## 环境要求

- **Windows 10/11**（当前脚本以 Windows 为主）
- **Node.js 20+**、npm 10+
- **Python 3.10+**（TTS 服务，由 `首次安装.bat` 配置进项目 `.venv`）
- **Git**（可选，用于克隆 Bert-VITS2 等）

## 快速开始

1. 双击 **`首次安装.bat`**（只需一次：npm、Live2D 模型、Python `.venv`、Qwen 模型检查）
2. 双击 **`启动.bat`**（TTS 窗口 + 桌宠；关闭桌宠后 TTS 一并退出）

命令行等价：

```bash
npm install
npm run setup:model    # 下载 Live2D 官方 hiyori_pro 样例
npm run dev            # 仅桌宠（需另开 TTS，见下）
```

成功效果：桌面透明窗显示 Live2D 猫娘；右键 → **回家** 打开中央「家」窗口。

### 常见问题

**`启动.bat` 闪退：** 在 PowerShell 中运行 `cmd /k .\启动.bat` 查看完整报错。

**Electron 未安装完整：** `npm rebuild electron` 或删除 `node_modules` 后重新 `npm install`（项目 `.npmrc` 已配国内镜像）。

**窗口一片空白：** 执行 `npm run setup:model` 补全 Cubism Core 与模型文件。

## 触摸语音（里程碑 2）

### 三种反馈模式

| 模式 | 说明 | 适用引擎 |
|------|------|----------|
| **精选音频** `curated` | 播放 `public/touch_clips/` 内 wav，零 TTS 推理 | 任意 |
| **音色工坊语料** `custom_corpus` | 编辑语料 → Qwen Base 克隆预热 → 点击播放缓存 | 运行中后端为 **qwen** |
| **第三方引擎语料** `alt_engine_corpus` | 编辑语料 → 当前私有引擎预热 | **bert_vits2** 等（非 qwen） |

UI 以 TTS `/health` 的 **运行中 backend** 为准：跑 qwen 时显示音色工坊；跑 bert 时显示「第三方引擎语料」。

### 触摸实时推理

入口：**桌宠右键 → ⚙️ 设置 → 高级功能**。

| 状态 | 行为 |
|------|------|
| **关闭**（默认） | 优先播放语料**预热缓存**（`touch_cache/`）；未预热的句子可 fallback 实时合成 |
| **开启** | 每次点击走 **TTS 实时推理**，不读预热 wav；始终用语料库 TTS（不会播放精选音频） |

- 需先在**回家窗口**选定并切换到已有克隆参考音的声线（官方 `default_sample` 或 `custom_sample` 下自定义声线）。
- 开启时会切到语料 TTS 模式并加载当前激活声线的克隆引擎；关闭后只等待引擎挂载，后台可继续预热语料。
- 开关写入 `.runtime/realtime-inference.env`（本地，不入库）。与「官方精选音频 / 第三方引擎语料」等模式互斥时会自动协调（例如切回精选会关闭实时推理）。

### TTS 引擎

配置：`tts_voice/config.yaml`（改 `engine` 后**关闭 TTS 窗口**并重新 **`启动.bat`**）。

| 引擎 | 说明 |
|------|------|
| `qwen` | **默认**。VoiceDesign + Base 1.7B；支持音色工坊 |
| `bert_vits2` | 可选。需 `Bert-VITS2/` 源码 + 私有化声音权重配置|
| `style_bert_vits2` | **占位**，尚未进行总体对接测试；欢迎 PR / Issue |



详细对接与 API：`tts_voice/ENGINE_HOOKS.md`。

### 模型与权重

**随仓库分发（开箱可玩精选模式）：**

- `public/touch_clips/` — manifest + `.wav`
- `voice_forge/default_sample/` — 官方 Qwen 克隆参考音

**需本机准备（不入库）：**

- **Live2D：** `npm run setup:model` → `public/models/hiyori_pro/`
- **Qwen 大模型：** 首次安装引导下载至 `Qwen3_TTS/models/`
- **Bert-VITS2：** `scripts\setup-bert-vits2.cmd` + `tts_voice/bert/` 权重

Python 依赖统一装在项目根 **`.venv`**，三引擎共用，无需为 Bert 单独建环境。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式桌宠 |
| `npm run build` | 打包应用 |
| `npm run setup:model` | 下载/补全 Live2D hiyori_pro |
| `npm run typecheck` | Vue/TS 类型检查 |
| `npm run tts` | 仅启动 TTS（`.venv` + `tts_server.py`） |

## 项目结构（核心）

```
Xue_CyberNeko/
├── electron/           # 主进程、preload、IPC
├── src/                # 桌宠 / 家窗口 Vue 前端
│   ├── data/corpus.json
│   ├── components/     # Live2D、设置、音色工坊等
│   └── services/       # 语料、TTS、交互
├── tts_voice/          # FastAPI TTS 服务 + engines 注册表
├── voice_forge/        # 音色工坊样本（default / custom）
├── scripts/            # 安装、启动、模型下载脚本
├── public/
│   ├── models/         # Live2D（见 README）
│   └── touch_clips/    # 精选触摸 wav + manifest
├── 首次安装.bat
├── 启动.bat
└── package.json
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [`tts_voice/ENGINE_HOOKS.md`](tts_voice/ENGINE_HOOKS.md) | TTS 引擎对接、缓存、config.yaml |
| [`public/models/README.md`](public/models/README.md) | Live2D 模型替换 |
| [`voice_forge/README.md`](voice_forge/README.md) | 音色工坊目录结构 |
| [`public/touch_clips/README.md`](public/touch_clips/README.md) | 精选音频 manifest |

## 许可证

MIT（里程碑 7 发布前正式确认）

## 关于下一阶段

下一阶段将正式把生成式语言大模型融进项目里，让雪澜可以陪你聊天!

## 赞助

项目免费开源；后续可能开放投喂入口，欢迎 Star 与 Issue。

## 一些悄悄话

因为实际开发过程中可能会根据我使用下来的体验，可能会更换相关技术栈或者架构，所以里程碑的技术栈和功能仅提供大致方向的参考，因为估计开发过程中就是想到啥就按这个想法开发或者改架构了.......
