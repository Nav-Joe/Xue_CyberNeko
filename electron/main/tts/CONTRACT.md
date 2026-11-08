# 安装包语音进程

> **对齐：** `electron/main/config/CONTRACT.md` 目录根 · `tts_voice/tts_server.py`  
> **职责：** 两个根不同时，由主进程拉起 `tts_server.py`；退出时只停自己拉起的那一份。

## 边界

| 允许 | 禁止 |
|------|------|
| 探活 `127.0.0.1:8000`、导入检查、spawn、停托管进程 | 开发时再拉一份（启动脚本已经在拉） |
| 没装依赖时放开加载窗 | 杀掉别人开在 8000 上的进程 |
| 传入 `XUE_DATA_ROOT` / `XUE_INSTALL_ROOT` | 改端口、改 `启动.bat` 的可见窗口 |

## 所有权

| 态 | 含义 |
|----|------|
| `none` | 没拉起 |
| `external` | 探活时端口上已经有服务 |
| `app_spawned` | 本应用 spawn 成功 |

- 两个根相同：不探活、不 spawn、不改加载窗。
- 端口已有服务：记 `external`，加载窗继续等 `ready === true`。
- 没有解释器、导入失败，或脚本不在：不 spawn，加载窗不再等语音。
- 导入通过且端口空着：cwd 为只读根，隐藏窗口，stderr 写到数据根 `.runtime/logs/tts-server.stderr.log`。
- 自己的子进程退出：清掉所有权，并放开还在等的加载窗。
- 退出 App：只对 `app_spawned` 做 `taskkill /T`。

导入检查与环境页「本地语音合成」相同：`import soundfile, fastapi, uvicorn, qwen_tts, torch`，限时 20 秒，不堵住开窗。
