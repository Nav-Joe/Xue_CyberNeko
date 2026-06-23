# 官方配置（default_sample）

项目**默认 Qwen 克隆声线**参考样本，随仓库分发。

## 文件

| 文件 | 说明 |
|------|------|
| `reference.wav` | 克隆参考音频 |
| `reference.txt` | 与 wav 完全一致的文字 |
| `meta.json` | 可选元数据 |

缺少 `reference.wav` 或 `reference.txt` 时，语料模式会报错；请在音色工坊执行「创造新音色 / 重新生成声线」，或补全上述文件。

## 运行时产物（不入库）

预热后在同目录生成 `touch_cache/`、`corpus.snapshot.json` 等，已在 `.gitignore` 中排除。
