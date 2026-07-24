# Qwen attn：eager vs sdpa 对拍

> 位置：`tts_voice/tests/`（与自动化单测同目录；本文件为说明，**可运行脚本**见同名 `.py`）

## 固定句子

```
我是雪澜，一只可爱又活泼的猫娘喵，很高兴认识你~
```

## 怎么跑

在项目根目录：

```bat
.venv\Scripts\python.exe tts_voice\tests\bench_attn_sdpa_vs_eager.py
```

## 测什么

| 项 | 说明 |
|----|------|
| 模型 | VoiceDesign（`qwen_config.json` → `voice_design_model_dir`） |
| 对比 | 先 `eager` 再 `sdpa`（各自加载 / 预热 1 次 / 计时 3 次平均） |
| 指标 | 加载秒、单次推理平均秒、RTF（推理秒/音频时长） |
| 种子 | `42`（尽量可比；非绝对比特级复现） |

**不**进 `npm run test:tts`（文件名不以 `test_` 开头），避免日常 pytest 拉起 1.7B。

## 配置回落

生产默认：`qwen_config.json` → `"attn_implementation": "sdpa"`。  
临时强制：`set QWEN_ATTN_IMPLEMENTATION=eager` 后重启 TTS。

## 本机跑分记录（2026-07-22）

设备：`cuda:0` + `bfloat16`；句子同上；warmup=1 / runs=3 / seed=42。

| attn | 加载(s) | 3 次平均推理(s) | RTF |
|------|---------|-----------------|-----|
| eager | 26.28（含首次冷加载，不宜对比） | **11.73** | 2.01 |
| sdpa | 3.26（热缓存，不宜对比） | **8.47** | **1.68** |

- **同句墙钟加速：** eager/sdpa ≈ **1.39×**（约 **快 27.8%**，省约 3.3s）
- **RTF：** 2.01 → 1.68（音频时长因采样略有差异，以 RTF 更可比）
- 日志有 `flash-attn is not installed`：当前用的是 PyTorch **sdpa**，不是 flash-attn 包
