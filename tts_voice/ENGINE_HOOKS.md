# TTS 引擎对接说明

触摸**音色工坊**（`custom_corpus`）会走 `tts_voice/tts_server.py` 的 `/tts` 与语料预热缓存。公开默认使用 `public/touch_clips/` 精选 wav，不加载私有权重。

## 统一引擎接口

所有 TTS 引擎（含默认 Qwen3-TTS）均通过 **`tts_voice/engines/`** 注册表加载。

### 引擎需实现的接口

在 `tts_voice/engines/base.py` 中定义：

| 成员 | 说明 |
|------|------|
| `warmup()` | 启动预热 |
| `synthesize(text, speaker_id=0, seed=None)` | 返回 WAV 字节 |
| `capabilities` | `EngineCapabilities(voice_forge=…, supports_corpus_cache=…)` |
| `clone_reference_path` | 克隆参考音路径；无则返回 `None` |

新建其他TTS引擎步骤：

1. 在 `tts_voice/engines/` 下新增模块（或实现 `style_bert_vits2.py` 占位文件中的 `create_engine()`）。
2. 在 `tts_voice/engines/registry.py` 的 `_CREATORS` 中注册引擎名与工厂函数。
3. 在 `tts_voice/config.yaml` 的 `engines` 节声明该引擎的配置项。
4. 将 `engine:` 改为新引擎名，重启 TTS 服务。

## 配置文件 `tts_voice/config.yaml`

```yaml
engine: qwen

engines:
  qwen:
    config_path: qwen_config.json

  bert_vits2:
    config_path: bert/config.json
    model_path: bert/G_xxx.pth（你自己的声音配置权重）
    root: ../Bert-VITS2
```

**优先级：** 环境变量 `TTS_ENGINE`（或兼容旧名 `TTS_BACKEND`）> `config.yaml` > 默认 `qwen`。

若改了 `config.yaml` 仍显示 qwen，可在项目根运行 `scripts\win\check-tts-engine.cmd` 查看是否有环境变量覆盖、启动脚本解析结果与 `/health` 是否一致。

## Bert-VITS2 环境

**不需要**为 Bert-VITS2 单独再建一套 Python 虚拟环境。项目使用根目录 `.venv`：

- `首次安装.bat` / `prepare-tts-env.cmd` 会安装 `tts_voice\requirements.txt`
- 检测到 `Bert-VITS2\` 时，会额外安装 `tts_voice\requirements-bert-vits2-infer.txt`（jieba、transformers 等）
- `Bert-VITS2\` 目录只是**源码仓库**（含 `infer.py`），运行时通过 `sys.path` 引入，权重放在 `tts_voice\bert\`

首次使用私有引擎可运行 `scripts\setup-bert-vits2.cmd`（克隆仓库 + 下载中文 BERT）。

修改后需**重启 TTS 窗口**（重新运行 `启动.bat`）。

也可运行 `scripts\win\switch-tts-backend.cmd`（或本地 `切换TTS引擎.bat`）交互切换，会直接写入 `config.yaml`。

## 语料缓存与增量预热

Qwen 音色工坊与第三方引擎语料（`alt_engine_corpus`）共用 `audio_cache.py` 逻辑：

- 每个语料库对应一份 `touch_cache/manifest.json`（Qwen 按声线目录；Bert 等在 `voice_forge/other_custom_cache/{engine}/touch_cache/`）。
- **修改语料后**只删除/重合成**变更或新增**的句子（×3 变体），未改动的句子保留 WAV。
- **全量重建**仅在：同目录下引擎/权重/克隆声线变更、manifest 缺失或 wav 不完整等情况下触发。
- **切换 TTS 引擎**（Qwen ↔ Bert）时使用**不同缓存目录**；目标目录已有有效 manifest + wav 时直接复用，不会互相清空后重跑全库。
- 保存语料时若引擎已在内存中就绪，**不会**重新加载模型，只跑增量 TTS。

### 触摸实时推理

前端入口：**桌宠右键 → ⚙️ 设置 → 高级功能**。开关由 Electron 写入 `.runtime/realtime-inference.env`（`1` 为开启）；TTS 侧通过 `read_realtime_inference_enabled()` 读取。

| 状态 | 触摸播放 | 语料预热 |
|------|----------|----------|
| **关闭**（默认） | 优先 `GET /cache/audio` 读 `touch_cache/`；无缓存时 `POST /tts` | 启动 / 同步时 `build_sync`（或用户触发的增量预热） |
| **开启** | 每次点击 `POST /tts` 实时合成 | 克隆引擎就绪后 `build_async` **后台**预热，不阻塞点击 |

开启时会将触摸模式切到 `custom_corpus` 并加载当前激活声线的 Qwen 克隆引擎；关闭后前端以 `engine` 模式等待引擎挂载，不要求全库 cache ready 再退出加载界面（详见 `src/services/voiceEngineLoading.ts`）。

与精选音频、第三方语料等模式冲突时由 `runtimeConfig.ts` / `voice_runtime_repair.py` 协调（例如切回精选会 `writeRealtimeInferenceFlag(false)`）。

## 共用 Python 环境（.venv）

**Bert-VITS2、Style-Bert-VITS2、Qwen 共用项目根 `.venv`**，无需为每个引擎单独建环境：

- 基础依赖：`tts_voice/requirements.txt`
- Qwen：`qwen-tts`、`modelscope`（`install-tts-deps.cmd` 自动装）
- Bert 推理：`tts_voice/requirements-bert-vits2-infer.txt`（检测到 `Bert-VITS2/` 时安装）
- Style-Bert-VITS2 对接后通常可复用同一套推理依赖；若上游 pinned 版本冲突，再在 `requirements-*.txt` 里统一 pin 即可

注意：同一时刻 TTS 进程只跑**一个**引擎。

## Qwen 音色工坊（VoiceDesign → Base 克隆）

启用 **custom_corpus** 且引擎为 `qwen` 时：

1. 用 **instruct**（默认 `qwen_config.json`，用户覆盖见 `.runtime/voice-forge.json`）+ **clone_reference_text** 生成或加载克隆参考 wav：
   - 官方：`voice_forge/default_sample/`
   - 用户：`voice_forge/custom_sample/`（VoiceDesign 或**实验功能**上传 WAV，见下节）
2. 加载 **Base 1.7B**，`create_voice_clone_prompt(ref_audio, ref_text)` 锁定声线。
3. 对该参考音克隆合成语料库全部句子 × 3 随机种子，写入当前激活声线目录下的 `touch_cache/`。

所需模型（ModelScope，由 `首次安装.bat` / `scripts/win/check-qwen-models.cmd` 引导下载至 `Qwen3_TTS/models/`）：

- `Qwen3_TTS/models/Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- `Qwen3_TTS/models/Qwen3-TTS-12Hz-1.7B-Base`

精选模式（curated）仍只加载 VoiceDesign，不占用 Base 显存。

## 实验功能（音色工坊）

**「实验级功能」**：允许在音色工坊上传自有 WAV 作为克隆参考音（替代 VoiceDesign 生成），样本写入 `voice_forge/custom_sample/<folderId>/`。

- 开关默认**关闭**；Electron 在 `app.whenReady()` 调用 `resetExperimentalFeaturesOnStartup()`，**每次启动应用**重置为关闭，同一会话内可手动再开。
- 状态文件：`.runtime/experimental-voice-upload.json`（本地，不入库）。
- 上传流程经 `POST /voice-forge/upload-ready` 进入试听确认；请勿提交侵权或未授权素材。

用户自定义声线目录已在 `.gitignore` 中排除（仅保留 `custom_sample/README.md` 占位）。

## 内置引擎一览

| 引擎名 | 说明 | 音色工坊 | 额外条件 |
|--------|------|----------|----------|
| `qwen` | 默认 Qwen3 VoiceDesign + Base 克隆预热 | 支持 | 见上节模型路径 |
| `bert_vits2` | Bert-VITS2 推理 | 不支持 | `Bert-VITS2/` + `tts_voice/bert/G_900.pth` 等 |
| `style_bert_vits2` | Style-Bert-VITS2 插件位 | 不支持 | **占位未实现**，欢迎 PR |

## Bert-VITS2

1. 克隆 [Bert-VITS2](https://github.com/fishaudio/Bert-VITS2) 到项目根 `Bert-VITS2/`（或在 `config.yaml` 修改 `engines.bert_vits2.root`）。
2. 放置权重与推理 config，例如 `tts_voice/bert/G_900.pth`、`tts_voice/bert/config.json`（见 `config.yaml` 的 `model_path` / `config_path`）。
3. 将 `config.yaml` 中 `engine` 设为 `bert_vits2`，重启 TTS。
4. 推理依赖由 `首次安装` / `prepare-tts-env.cmd` 写入项目 `.venv`（`requirements-bert-vits2-infer.txt`），**无需**进入 Bert-VITS2 再建 venv。

## Style-Bert-VITS2

1. 在 `tts_voice/engines/style_bert_vits2.py` 实现 `create_engine()`，返回符合 `TtsEngine` 协议的实例。
2. 在 `registry.py` 中已预留 `_create_style_bert_vits2` 入口。
3. 在 `config.yaml` 的 `engines.style_bert_vits2` 下配置权重路径。
4. 将 `engine` 设为 `style_bert_vits2` 并重启。

当前占位实现会抛出明确错误，提示完成上述步骤。

## HTTP API（与引擎无关）

| 路径 | 说明 |
|------|------|
| `GET /health` | 服务状态；`backend` 字段为当前引擎名 |
| `POST /tts` | 合成单句（body: `{ text, speaker_id?, seed? }`） |
| `GET /voice-forge/status` | 音色工坊会话状态 |
| `POST /voice-forge/upload-ready` | 上传参考音后进入试听 |

语料缓存 manifest 中的 `backend` 字段记录引擎名。Qwen 按声线目录、Bert 等在 `other_custom_cache/{engine}/touch_cache/` 各存一份；切换引擎后读取对应目录，有效则跳过预热。
