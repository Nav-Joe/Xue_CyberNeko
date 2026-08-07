# STT 侧车

本机语音转文字服务。契约见 [`CONTRACT.md`](./CONTRACT.md)。

## 依赖

使用仓库根目录 `.venv`。清单：`stt_service/requirements.txt`（`sherpa-onnx`、`fastapi`、`uvicorn`、`python-multipart`、`numpy`）。

- **首次安装**：`首次安装.bat` → `install-stt-deps.cmd`（pip）+ `install-stt-models.cmd`（权重）
- **仅补依赖**：`scripts\win\install-stt-deps.cmd`
- **仅补模型**：`scripts\win\install-stt-models.cmd`（GitHub asr-models，约 160MB 压缩包 / 解压约 230MB）

## 模型

默认目录（**不入库**，安装脚本下载到本机）：

```text
.runtime/stt-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/
  model.int8.onnx
  tokens.txt
```

覆盖路径：

```powershell
$env:XUE_STT_MODEL_DIR = "D:\path\to\model-dir"
```

线程数（可选）：`XUE_STT_NUM_THREADS`（默认 `2`）。

## 启动

开发时也可手动：

```powershell
.\.venv\Scripts\python.exe -m stt_service
```

聊天设置开启「语音输入」后，Electron 主进程会自动 ensure（已在跑则复用；否则用仓库 `.venv` 代启）。关闭总闸只停止本应用拉起的进程。

- 绑定 `127.0.0.1`，端口按 `8767→8772` 自动选用  
- 实际端口写入 `.runtime/stt-server.port`  

## 探活 / 识别

```powershell
curl.exe http://127.0.0.1:8767/health

curl.exe -F "file=@.runtime/stt-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/zh.wav" `
  http://127.0.0.1:8767/v1/recognize
```

若 8767 被占用，把 URL 里的端口改成 `.runtime/stt-server.port` 里的数字。

## 测试

```powershell
.\.venv\Scripts\python.exe -m pytest stt_service/tests -q
```
