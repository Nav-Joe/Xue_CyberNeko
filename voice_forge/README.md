# 音色工坊

Qwen 引擎运行时的克隆声线与语料样本目录。

| 目录 | 说明 |
|------|------|
| `default_sample/` | **官方默认**克隆参考（VoiceDesign 生成或预置 wav） |
| `custom_sample/<folderId>/` | 用户在音色工坊创建的自定义声线（参考音；**用户数据不入库**） |
| `other_custom_cache/<engine_name>/` | Bert 等第三方引擎的语料预热缓存根目录（**运行时产物不入库**） |

每个样本目录通常包含：

- `profile.json` — 显示名与 `folderId`
- `reference.wav` / `reference.txt` / `meta.json` — 克隆参考
- `corpus.snapshot.json` — 该声线语料快照（预热用）
- `touch_cache/` — 预热 wav + manifest（**本地生成，不入库**）

## 非 Qwen 引擎

当 TTS 运行 **bert_vits2** 等第三方后端时：

- **克隆参考音**仍在 `default_sample/` / `custom_sample/`（Qwen 音色工坊产物）
- **语料预热 wav** 写入 `other_custom_cache/{engine_name}/touch_cache/`（与 Qwen 声线目录分离，切换引擎可各自复用缓存）

```
voice_forge/other_custom_cache/bert_vits2/
  corpus.snapshot.json   # 本地
  touch_cache/           # 本地
```

在桌宠 **高级设置 → 第三方引擎语料**（`alt_engine_corpus`）中编辑保存；若磁盘上已有有效预热缓存，切换引擎重启 TTS 时会跳过全量重建。

## 触摸实时推理

入口：**桌宠右键 → ⚙️ 设置 → 高级功能**（与 TTS 行为详见 `tts_voice/ENGINE_HOOKS.md`）。

- **关闭**（默认）：点击优先播放本声线目录下 `touch_cache/` 预热 wav。
- **开启**：每次点击走 Qwen Base 实时克隆合成；语料仍来自当前激活声线的 `corpus.snapshot.json` / 全局语料配置。
- 需先在**回家窗口**切换到已有 `reference.wav` 的声线（`default_sample` 或 `custom_sample/<folderId>/`）。
- 开启时仍会后台写入 `touch_cache/`，便于之后关闭实时推理切回缓存播放。

开关：`.runtime/realtime-inference.env`（不入库）。

## 实验功能

音色工坊页内的 **「实验级功能」** 开关控制是否显示「上传 WAV 音频」。

- 默认关闭；**每次启动应用**自动重置为关闭（`.runtime/experimental-voice-upload.json`）。
- 上传成功后参考音落在 `custom_sample/<folderId>/`（**用户数据不入库**）。
- 仅限个人合理使用；界面内有法律风险提示，开启前请阅读。

## 运行时

- 全局配置：`.runtime/voice-forge.json`
- 创建流程会话：`.runtime/voice-forge-session.json`
- 触摸实时推理：`.runtime/realtime-inference.env`
- 实验上传开关：`.runtime/experimental-voice-upload.json`

以上 `.runtime/` 文件均不入库。

详见根目录 [`README.md`](../README.md) 用户向说明与 [`tts_voice/ENGINE_HOOKS.md`](../tts_voice/ENGINE_HOOKS.md) TTS 侧细节。
