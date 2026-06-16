# 雪澜赛博猫娘（Xue_CyberNeko）

一个会动、会聊、会悄悄观察你的 Live2D 桌面 AI 桌宠。

## 🚧 当前施工进度

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **0** | 环境与骨架（Electron + Vue3 + TS） | ✅ 已完成 |
| **1** | 桌宠形态 + Live2D（透明窗、右键菜单、「家」窗口） | ✅ 已完成 |
| **2** | 预置语料库 + TTS 语音朗读 | ⬜ 待开发 |
| **3** | 对话能力（文字聊天 + Ollama） | ⬜ 待开发 |
| **4** | 记忆系统（RAG + 对话总结） | ⬜ 待开发 |
| **5** | 语音聊天（STT + TTS 连续对话） | ⬜ 待开发 |
| **6** | 主动行为 & 屏幕感知（窗口检测） | ⬜ 待开发 |
| **7** | 完善设置与打包发布（v1.0） | ⬜ 待开发 |

**里程碑 1 交付内容：** 透明无边框桌宠窗（仅 Live2D）、鼠标穿透、左键「喵」、右键菜单（回家/退出）、「家」窗口骨架。

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

## 项目结构

```
Xue_CyberNeko/
├── electron/              # 主进程（桌宠窗 + 家窗口）
├── src/
│   ├── PetApp.vue         # 桌宠界面（仅 Live2D）
│   ├── HomeApp.vue        # 「家」窗口入口
│   ├── components/        # Live2DView、右键菜单等
│   └── views/HomeView.vue
├── public/models/         # Live2D 模型（见 public/models/README.md）
├── index.html
└── package.json
```

替换模型说明见 [`public/models/README.md`](./public/models/README.md)。

## 许可证

MIT（后续里程碑 7 会正式确认）

## 关于赞助

后续会开放投喂窗口，项目免费开源，但如感兴趣可以自行赞助支持一下哦~
