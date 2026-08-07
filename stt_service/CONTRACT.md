# stt_service — CONTRACT

> **位置：** `stt_service/`  
> **对齐：** `docs/里程碑5-开发规范.md`（M5 · 方案 A）  
> **状态：** 契约已确认 · **M5.1 侧车已落地** · **M5.2 聊天接线已落地**  
> **性质：** 跨进程对照表；改路由/字段前先改本文，再改 preload / 客户端 / 服务端。

与对照文档：

- `docs/里程碑5-开发规范.md` — 产品交互与阶梯  
- `electron/main/chat/CHAT_CONFIG.md` — 总闸 / 子开关落盘（`sttEnabled` / `sttAutoSend` / `sttBaseUrl`）  
- `src/services/chat/CONTRACT.md` — 聊天发送路径（STT 结果视为用户打字）  
- `tts_voice/CONTRACT.md` — **解耦**：STT 不是 TTS 引擎  

---

## 1. 边界

| 允许 | 禁止 |
|------|------|
| 本机语音 → **纯文本** | 读/写 `memory.db`、角色卡、欲望/好感 |
| `127.0.0.1` HTTP（首版） | 默认绑 `0.0.0.0`；默认云 STT |
| 健康检查、整段识别 | 把逻辑塞进 `tts_voice/` 或 Electron 原生 addon |
| 可选服务端 VAD 去静音/辅助 | 用 VAD **替代**用户点「结束」（结束按钮是主路径） |
| CPU / ONNX（默认） | 默认与 Qwen TTS 抢同一块 CUDA |

**一句话：** 侧车只回答「这段音里说了什么字」；填框、自动发送、LLM、TTS 全在 Electron/渲染侧。

---

## 2. 进程与端口

| 项 | 约定 |
|----|------|
| 目录 | `stt_service/` |
| 绑定 | **`127.0.0.1` only** |
| 首选端口 | **`8767`**（避开 TTS `8000`、llama `8010+`、memory_service `8766`） |
| 备用端口表 | 见下表；**启动时按序探测，绑到第一个可绑定的端口**（对齐 llama 的 port candidates 思路） |
| 基址 | `http://127.0.0.1:<实际端口>`；客户端以探活结果或 `sttBaseUrl` 为准，**禁止写死只认 8767** |
| 启停 | 开 `sttEnabled` 时主进程 **ensure**（已在跑则复用；否则 spawn `.venv` 的 `python -m stt_service`）；关总闸 **只停 app_spawned**；用户手开侧车不动。见 `electron/main/stt/CONTRACT.md` |
| 引擎 | sherpa-onnx + SenseVoiceSmall int8 +（可选）Silero VAD |
| 模型 | 本地路径（如 `.runtime/stt-models/…`）；**权重不入库**；由 `首次安装` / `scripts/win/install-stt-models.cmd` 下载 SenseVoice int8 |
| Python 依赖 | `stt_service/requirements.txt` → 根 `.venv`；由 `首次安装` / `scripts/win/install-stt-deps.cmd` 安装 |

### 2.1 端口候选（固定顺序）

```
8767 → 8768 → 8769 → 8770 → 8771 → 8772
```

| 顺序 | 端口 | 说明 |
|------|------|------|
| 1 | **8767** | 默认首选 |
| 2 | 8768 | 备用 |
| 3 | 8769 | 备用 |
| 4 | 8770 | 备用 |
| 5 | 8771 | 备用 |
| 6 | 8772 | 备用 |

**启动约定（实现时遵守）：**

1. 仅尝试上表端口；全部被占 → 启动失败并打明确日志（列出已尝试端口），**不要**静默改用随机高位端口（免客户端找不到）。  
2. 绑定成功后，`GET /health` 可带 `"port": <实际端口>`（可选，便于日志）。  
3. 可将实际端口写入本机运行时小文件（如 `.runtime/stt-server.port` 或等价，**不入库**），供 Electron/渲染探测；或客户端按候选表依次 `GET /health` 直到命中 `service=stt`。  
4. 若用户在配置里写了 `sttBaseUrl`，**优先用配置**，不再自动扫表（高级覆盖）。  
5. 禁止占用：`8000`（TTS）、`8766`（memory_service）、llama 常用 `8010–8012` / `8080–8082`（除非将来显式改契约）。

---

## 3. HTTP 端点（M5.1 最小面）

### 3.1 `GET /health`

探活；不强制已加载完模型也可返回「进程在」——若实现选择懒加载，须在 JSON 标明模型状态。

**响应示例：**

```json
{
  "ok": true,
  "service": "stt",
  "engine": "sherpa-onnx-sensevoice",
  "modelReady": true,
  "sampleRate": 16000
}
```

| 字段 | 说明 |
|------|------|
| `ok` | 进程可服务（含「模型加载中」时须 `ok:false` 或另用 `modelReady` 区分——**实现时二选一并写死**，推荐：`ok`=进程活着，`modelReady`=可识别） |
| `modelReady` | 是否已可 `POST /v1/recognize` |
| `sampleRate` | 期望输入采样率，固定 **16000** |

### 3.2 `POST /v1/recognize`（主路径 · 对齐「点结束交卷」）

上传**一整段**录音，同步返回文本。

**请求：**

| 项 | 约定 |
|----|------|
| `Content-Type` | **权威：`multipart/form-data`，字段名 `file`**（已拍板） |
| 音频格式 | **WAV**，单声道，**16-bit PCM**，**16 kHz**（客户端负责转码） |
| 时长 | 上限 **60s**（超出 → `413` / `too_long`） |
| 可选表单字段 | `language`：`auto` \| `zh` \| `en` \| …（默认 `auto`） |

**成功响应：**

```json
{
  "ok": true,
  "text": "今天天气怎么样",
  "durationMs": 3200,
  "decodeMs": 110,
  "language": "zh"
}
```

| 字段 | 说明 |
|------|------|
| `text` | 识别结果；无语音/空内容时为 `""` 且 `ok: true`（由客户端提示「没听清」） |
| `durationMs` | 音频时长（可选，便于打日志） |
| `decodeMs` | 纯解码耗时（可选） |
| `language` | 引擎判定或请求值（可选） |

**失败响应：**

```json
{
  "ok": false,
  "error": "model_not_ready",
  "message": "人话短说明"
}
```

| HTTP | `error` 示例 | 含义 |
|------|----------------|------|
| 400 | `bad_audio` | 格式/采样率不对、空文件 |
| 413 | `too_long` | 超过时长上限 |
| 503 | `model_not_ready` | 模型未加载 |
| 500 | `recognize_failed` | 引擎异常 |

### 3.3 首版明确不做的端点

| 路径 | 状态 |
|------|------|
| WebSocket 流式 PCM | **M5.x**（点结束主路径不需要） |
| OpenAI 形 `/v1/audio/transcriptions` | 非必须；若加须另开小节，不替换 `/v1/recognize` |
| 云转发 | 禁止作默认 |

---

## 4. 客户端职责（渲染 / services）

```
点麦克风 → getUserMedia 录音
    → 点结束 → 停录 → 转 16k mono wav
    → POST /v1/recognize
    → text
         ├─ sttAutoSend=false → 写入输入框
         └─ sttAutoSend=true  → 调用现有发送（等同用户点发送）
```

| 项 | 约定 |
|----|------|
| 采音 | **仅渲染进程**（聊天窗）；桌宠窗无入口 |
| HTTP | 与 TTS 类似，**可直连** `127.0.0.1:8767`；侧车须开 **CORS**（`allow_origins=["*"]`，仅绑回环），否则渲染 `fetch` 失败会被误报成未启动。主进程 IPC **不强制**转发音频 |
| 代码位置 | `src/services/stt/` 协议客户端；UI 壳在 `components/chat/`；**禁止**把整段录音状态机塞进 `useChatSession` 涨爆 |
| 总闸 | `sttEnabled !== true` 时不展示或禁用麦按钮，且不发起 recognize |
| 空文本 | 不自动发送；可 toast / 行内提示 |

---

## 5. 配置（chat-config · 实现时写入 CHAT_CONFIG.md）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `sttEnabled` | boolean | **`false`** | 语音输入总闸 |
| `sttAutoSend` | boolean | **`false`** | `true` 识别后自动发送；`false` 只填输入框 |
| `sttBaseUrl` | string | `""`（空 = 按 §2.1 候选表探活） | 非空则**只**用该基址，不扫表 |
| `sttDeviceId` | string | `""` | 空=系统默认麦；非空为浏览器 `deviceId` |

- 设置 UI：放在**聊天设置**（与 TTS/LLM 同区），不进桌宠「记忆与情感」。  
- 总闸关：隐藏或禁用麦入口；子开关可一并隐藏。  
- **关总闸行为：** 与未上 STT 前一致（纯打字）。

---

## 6. 与对话 TTS 的关系

| 场景 | 约定（M5.2/5.3 落地） |
|------|------------------------|
| 进入语音模式 | 建议停止当前聊天 TTS 播放，避免扬声器被麦拾取 |
| TTS 播放中点麦 | 先停播再录音，或提示用户（实现选一种并写进聊天 CONTRACT） |
| 抢设备 | STT 只用输入设备；不改 `tts_voice` 路由语义 |

---

## 7. 隐私与仓库

- 录音只经本机回环；默认不上传公网。  
- **禁止**把 wav / 用户录音 / 模型权重提交进 git。  
- 日志可打 `decodeMs` / 错误码；**默认不要**把完整识别原文打进长期公开日志（若调试需要，须可关）。

---

## 8. 测试约定

| 类型 | 要求 |
|------|------|
| 侧车 | 健康检查 + 假音频/样例 wav → `ok`/`text` 形状（可不进 CI 大模型） |
| 渲染 | client mock：`sttAutoSend` 两分支；总闸关闭不请求 |
| 人工 | 开总闸 → 点麦 → 说话 → 点结束 → 填框或自动发送；关总闸无回归 |

---

## 9. 版本与变更

- 破坏性改字段/路径：先改本文 + M5 规范，再改代码。  
- 端口变更须同步 §2.1 候选表、探活逻辑与启动脚本说明；新增备用端口只能**追加**到表尾或整表修订本文。  

---

*契约草案结束 — 开 M5.1 实现前若端口/multipart 细节有异议，先改本文。*
