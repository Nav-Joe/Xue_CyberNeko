# PoC：non_streaming_mode True vs False

> **不改生产代码/默认配置。** 仅本机对拍脚本。

官方：`False` 只是模拟流式**文本**输入，**不是**边算边出 WAV。

## 固定句子

```
我是雪澜，一只可爱又活泼的猫娘喵，很高兴认识你~
```

## 怎么跑

```bat
.venv\Scripts\python.exe tts_voice\tests\bench_non_streaming_mode.py
```

同一模型实例、当前 `attn`（配置里的 sdpa）、seed=42；各模式 warmup 1 + 计时 3。

## 本机结果（2026-07-22 PoC）

设备：`cuda:0` + `bfloat16` + `attn=sdpa`；同一模型实例；seed=42；warmup=1 / runs=3。

| non_streaming_mode | 平均墙钟 | RTF | 末次音频时长 |
|--------------------|----------|-----|--------------|
| **True**（现状） | **8.60 s** | 1.71 | ≈5.04 s |
| **False** | **10.52 s** | 1.69 | ≈6.24 s |

- 墙钟：False 约为 True 的 **0.82×**（反而慢约 **22%** / 多约 1.9 s）
- RTF 几乎持平（1.71 vs 1.69）；False 这次生成了更长音频，墙钟更差主要来自「说得更长」，不是算得更快
- **仍无首包包延迟**：两端都是 `generate` 结束后才拿完整 WAV

**PoC 结论（供决策）：** 仅翻 `non_streaming_mode=False` **看不到效率提升**；在本机同句对拍下墙钟更差。不建议为「加速」改生产默认；真要首音提前需 B1（真流式）或 B2（句级流水线）。
