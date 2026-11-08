# 环境组件（设置 → 环境）

## 边界

- 主进程拥有「有没有装上、装、卸」。渲染进程只展示清单和发这三个动作。
- 编号固定在 `types.ts`。界面不能传入任意路径或任意脚本。
- 卸载只删该组件约定的权重或官方样板目录，不 `pip uninstall`，不删 `.venv`。
- Live2D 官方样板下载前必须由界面传入 `acceptLicense: true`。未同意则拒绝下载。
- 官方样板只有在 `public/models` 里还能找到别的 `.model3.json` 时才允许删除。
- 本轮没有插件商店、不加载第三方代码。
- 清单、安装和卸载用的是数据根。未打包时数据根就是仓库根。脚本文件在只读根。
- 两个根不同时，环境页不调用系统 Node / 系统 Python。日和用当前 Electron 加上 `ELECTRON_RUN_AS_NODE` 跑 `scripts/download-sample-model.js`，写到数据根。语音、听写、Qwen、Bert 使用数据根 `.venv\Scripts\python.exe`，由安装目录旁的嵌入版准备，不执行 `python -m venv`。未打包时日和仍是 `npm run setup:model`，虚拟环境仍由系统 Python 创建。`首次安装.bat` 不传这些变量。

## 必要 / 非必要

| 编号 | 必要 | 卸载 |
|------|------|------|
| `live2d-model` | 是（官方样板或已检测到的自备模型） | 仅当另有模型时删 `public/models/hiyori_pro` |
| `tts-sidecar` | 否 | 不提供 |
| `stt-sensevoice` | 否 | 删 `.runtime/stt-models` |
| `qwen-weights` | 否 | 删两套 Qwen3-TTS 权重目录 |
| `llama-local` | 否 | 删 `llama_bin`、仓库根 `llama-server.exe`、默认 gguf |
| `alt-engine-bert` | 否 | 不提供 |

同一时间只跑一个安装或卸载。

大小不写死。`size.ts` 的 `sumInstalledBytes` 按组件登记的相对路径加总磁盘占用；没有文件时 `sizeLabel` 为 null，界面不显示。新环境或插件只要交出路径列表即可复用。
