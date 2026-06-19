# 雪澜赛博猫娘（Xue_CyberNeko）

一个会动、会聊、会悄悄观察你的 Live2D 桌面 AI 桌宠。

## 项目前提须知

这个项目是我和Cursor Agent联合打造的，这个项目存在，纯粹是因为我想做它，就这么简单。
我把 Cursor 当搭档用。我负责架构设计、技术选型、功能定义和核心代码审查，Cursor 处理实现细节、样板代码和重复劳动。相当于和一个打字飞快、什么框架都懂的程序员结对编程。
所有的测试和AI生成的代码我都会进行人工测试和人工审查，保证项目质量。
如果你是古法编程爱好者，也请不要嫌弃这个项目谢谢喵~

## 重大更新预告！
里程碑2上线的具体可实现的内容如下，正在如火如荼的开发和测试当中！即将上线！

**音色工坊：** 内置Qwen3.0_tts引擎，可根据提示词生成你喜欢的声音！自定义程度拉满！并且用户可创建多个声音配置！

**自定义语料库：** 可以自定义触摸时的语料库，猫娘被触碰后说出的话完全由你来决定！

**实时推理功能：** 想要让猫娘的每句话不再是机械般的只调用预热好的音频？启动实时推理让猫娘更鲜活（但是注意这会不可避免的出现毕竟高的延迟，适合接受这方面延迟的玩家）



## 🚧 当前施工进度

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **0** | 环境与骨架（Electron + Vue3 + TS） | ✅ 已完成 |
| **1** | 桌宠形态 + Live2D（透明窗、右键菜单、「家」窗口） | ✅ 已完成 |
| **2** | 预置语料库 + Bert-VITS2 TTS | ✅ 已完成 |
| **3** | 对话能力（文字聊天 + Ollama） | ⬜ 待开发 |
| **4** | 记忆系统（RAG + 对话总结） | ⬜ 待开发 |
| **5** | 语音聊天（STT + TTS 连续对话） | ⬜ 待开发 |
| **6** | 主动行为 & 屏幕感知（窗口检测） | ⬜ 待开发 |
| **7** | 完善设置与打包发布（v1.0） | ⬜ 待开发 |

**里程碑 1：** 透明桌宠窗、拖拽、右键菜单、回家窗口中央显示猫娘。  
**里程碑 2：** 部位语料 JSON、点击抽句 + Bert-VITS2 TTS、音量滑条。

## 环境要求

- Node.js 20+（推荐 LTS）
- npm 10+
- Git

## 快速开始

```bash
# 1. 进入项目目录
cd Xue_CyberNeko

# 2. 安装依赖（首次运行需要几分钟）
npm install

# 3. 下载 Live2D 示例模型（首次必须执行）
npm run setup:model

# 4. 启动开发模式
npm run dev
```

成功后会看到：**桌面上只有 Live2D 猫娘**（透明无边框窗口）。右键猫娘 →「回家」可打开「家」窗口。

### 里程碑 2：语料 + TTS

1. 克隆 [Bert-VITS2](https://github.com/fishaudio/Bert-VITS2) 到项目旁或任意目录，安装其 `requirements.txt` 与 PyTorch。
2. 将你的 `config.json`、`G_900.pth` 放在 `tts_voice/`（已放置可跳过）。
3. 设置环境变量 `BERT_VITS2_ROOT` 指向 Bert-VITS2 目录（或克隆到项目根 `Bert-VITS2/`）。
4. 双击 **`启动TTS.bat`**，再双击 **`启动开发.bat`**。
5. 点击猫娘：从 `src/data/corpus.json` 随机抽句并 POST 到 `http://127.0.0.1:8000/tts` 播放。

语料按 `head / arms / body / legs / tail` 分区；当前模型仅有 Body HitArea，程序用点击坐标划分虚拟部位，其它分区留空时会回退到 `body` 语料。

### 常见问题：`Error: Electron uninstall`

表示 Electron 桌面运行时没有下载完整（常见于首次 `npm install` 被中断或网络超时）。

```bash
# 方法一：重新安装 Electron（推荐）
npm rebuild electron

# 方法二：删除后重装全部依赖
Remove-Item -Recurse -Force node_modules
npm install
```

项目已配置国内镜像（`.npmrc`）和 `postinstall` 自动检测脚本，正常 `npm install` 应能自动修复。

### 常见问题：窗口一片空白

缺少 Live2D Cubism Core 运行时会导致 Vue 无法加载 Live2D 模块，窗口全白。执行：

```bash
npm run setup:model
npm run dev
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式，支持热更新 |
| `npm run build` | 打包应用 |
| `npm run preview` | 预览打包结果 |
| `npm run setup:model` | 下载 Live2D 官方 Haru 示例模型 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run tts` | 启动 Bert-VITS2 TTS 服务（需 Python） |

## 项目结构

```
Xue_CyberNeko/
├── electron/              # 主进程（桌宠窗 + 家窗口）
├── src/
│   ├── data/corpus.json   # 按部位预置语料
│   ├── services/          # 语料、TTS、点击交互
│   ├── PetApp.vue         # 桌宠界面（仅 Live2D）
│   ├── HomeApp.vue        # 「家」窗口入口
│   ├── components/        # Live2DView、右键菜单、音量等
│   └── views/HomeView.vue
├── tts_voice/             # Bert-VITS2 权重 + tts_server.py
├── 启动开发.bat / 启动TTS.bat
├── public/models/         # Live2D 模型（见 public/models/README.md）
├── index.html
└── package.json
```

替换模型说明见 [`public/models/README.md`](./public/models/README.md)。

## 许可证

MIT（后续里程碑 7 会正式确认）

## 关于赞助

后续会开放投喂窗口，项目免费开源，但如感兴趣可以自行赞助支持一下哦~
