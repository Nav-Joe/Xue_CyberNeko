# Xue CyberNeko（雪澜赛博猫娘）

A Live2D desktop AI companion that moves, chats, and quietly watches over you.

**Current version: V0.6.3 (early development)**

> **Docs languages:** [中文 README](README.md) · [English README](README.en.md) (this file)

## Project premise

This project is built jointly by me and Cursor Agent — it exists simply because I wanted to make it.

I treat Cursor as a pair-programming partner: I own architecture, tech choices, feature definition, and core code review; Cursor handles implementation details, boilerplate, and repetitive work. Think of it as pairing with a fast typist who knows every framework.

Every test and every AI-generated change still goes through my manual testing and review. If you prefer “hand-crafted only” coding, please don’t dismiss this project — thank you, meow~

## ⚠️ Notice

Development and testing are based on the **Hiyori Pro** Live2D model. If you swap in another model, you may hit bugs — please fix those on your own!

## Highlights

### Proactive screen awareness

Xue Lan can peek at your screen now~ She may notice what you’re playing and drop a short comment out of nowhere~ (Steam games only for now.)

⚠️ You need your own **vision-capable** LLM API endpoint.

## 🚧 Milestone progress

| Milestone | Goal | Status |
|-----------|------|--------|
| **0** | Electron + Vue 3 + TypeScript skeleton | ✅ |
| **1** | Pet window, Live2D, context menu, “Home” window | ✅ |
| **2** | Corpus + multi-engine TTS + Voice Forge + curated clips | ✅ |
| **3** | Text chat + llama.cpp + OpenAI API + chat TTS | ✅ |
| **4** | Memory foundation & retrieval (no vectors); **4.5** self-built emotion sim | 🔧 **4 ✅** / **4.5** first plugin ✅ |
| **5** | Chat-window voice input (STT) | ✅ |
| **6** | Proactive behavior & screen awareness | ✅ |
| **7** | Settings polish & packaging / release | ⬜ |

## Requirements

- **Windows 10/11** (scripts are Windows-first; Steam library parsing and process gating follow Windows paths)
- **Node.js 20+**, **Python 3.10+** (`首次安装.bat` can install them; defaults lock **Node 24.16.0** and **Python 3.10.10**, see `scripts/win/runtime-versions.cmd`)
- TTS deps install into project **`.venv`** (does not pollute system Python)
- **Git** (optional; e.g. cloning Bert-VITS2)
- **Text chat (local mode):** first use auto-downloads llama-server and the default GGUF (~2 GB, under `llama_models/`)
- **Screen peek (optional):** chat TTS must be on; configure a separate vision API (not the chat API); first release only watches the screen when a **Steam game is running**

## Quick start

1. Double-click **`首次安装.bat`** (once: npm, Live2D model, Python `.venv`, TTS/STT pip deps, SenseVoice / Qwen models)
2. Double-click **`启动.bat`** (TTS window + pet; closing the pet also stops TTS)
3. **Home → Text chat**, or use the chat shortcut beside the pet

CLI equivalent:

```bash
npm install
npm run setup:model    # download official Live2D hiyori_pro sample
npm run dev            # pet only (start TTS separately; see below)
npm run tts            # TTS service only
npm test               # frontend vitest
npm run test:memory    # memory DB integration tests (temp Node ABI → restore Electron)
npm run test:tts       # Python pytest (tts_voice/tests)
npm run typecheck      # Vue/TS typecheck
npm run rebuild:native # rebuild native modules (e.g. better-sqlite3) for Electron ABI
```

Expected result: a transparent desktop window with the Live2D catgirl; right-click → **Home** opens the central Home window.

### Text chat (short)

| Mode | Notes |
|------|--------|
| **Local llama** | On entering chat or switching to local in settings, detects llama-server; if not running, guides download / start; closing the chat window stops the llama process this app started |
| **Third-party API** | Set Base URL, model name, and API Key in chat settings; requests are proxied via main-process IPC |
| **Voice input (STT)** | Enable in chat settings; tap mic → speak → end → fill the draft or auto-send (off by default; call-style continuous voice deferred) |

Chat bubbles still live in this window’s memory by default. With **Memory** enabled in pet settings, dialogue is written to `%APPDATA%/xue-cyber-neko/memory.db` (Electron `{userData}/memory.db`, consolidated asynchronously on close). With memory off, chat behavior matches the earlier text-chat-only stage.

### Privacy & local data (please read)

Raw dialogue, summaries, user profile, desire / affection history, API keys, screen summaries / narrations, and similar data **must stay on your machine**. `.gitignore` already blocks common accidental commits — **do not** copy them into the repo or paste them into Issues.

**Screen peek note:** The master switch defaults **off**. When it is on and a Steam game is detected, the app takes a **thumbnail** on your interval (in memory only — **original frames are not written to disk**), compresses the frame into a short text summary, and may send that summary path’s image to your configured **vision API**. Narration does **not** enter chat bubbles. Switch off = no capture, no process scan, no narration.

| Local path (Windows) | Contents |
|----------------------|----------|
| `%APPDATA%/xue-cyber-neko/memory.db` | Raw dialogue, daily/weekly/monthly summaries, core memories, user profile; desire, 3D affection, today’s pet-touch; plus companion-session summaries (`source=companion`), etc. (same DB) |
| `%APPDATA%/xue-cyber-neko/chat-config.json` | LLM / TTS / memory & emotion toggles; **chat API Key is persisted only in the main process** |
| `%APPDATA%/xue-cyber-neko/character-cards.json` | Your character cards (persona, etc.) |
| `%APPDATA%/xue-cyber-neko/screen-companion-config.json` | Screen-peek master switch / interval / pause / process blacklist; **vision API Key is persisted only in the main process** (optional encryption) |
| `%APPDATA%/xue-cyber-neko/screen-companion-memory/` | Temporary companion-session JSONL (narration + screen summary text; written only when memory is on; may consolidate into `memory.db` after the session ends) |

What **is** allowed in the repo: schema / migration SQL, default character-card templates, and module contracts (no real secrets). Dev scratch DBs and POC logs live under `.runtime/` (the whole directory is ignored).

### FAQ

**`启动.bat` flashes and exits:** In PowerShell run `cmd /k .\启动.bat` to see the full error.

**Electron incomplete:** `npm rebuild electron`, or delete `node_modules` and re-run `npm install` (project `.npmrc` already sets China mirrors).

**`better-sqlite3` / `NODE_MODULE_VERSION` errors:** The native module must match **Electron**, not system Node. Run `npm run rebuild:native` (`npm install` / first-install postinstall also rebuilds).

**Blank window:** Run `npm run setup:model` to restore Cubism Core and model files.

**Local chat won’t connect:** Check `.runtime/logs/llama-server.stderr.log`; if port 8080 is taken, close the conflict or let the app pick another port.

**Screen peek stays silent / never looks:** Confirm chat TTS is on, the vision API (Base URL / model / Key) is complete, the master switch is on, and a **Steam-library game** is running (browsers / IDEs are not covered in v1). While a companion session is active, chat send is blocked by a system dialog; closing the game or leaving the session restores chat.

## Touch voice (Milestone 2)

### Three feedback modes

| Mode | Notes | Engines |
|------|--------|---------|
| **Curated audio** `curated` | Plays wav under `public/touch_clips/` | Any |
| **Voice Forge corpus** `custom_corpus` | Edit corpus → Qwen clone warmup → play cache on click | **qwen** |
| **Alt-engine corpus** `alt_engine_corpus` | Edit corpus → warmup with current private engine | **bert_vits2**, etc. |

UI follows the **running backend** from TTS `/health`.

### Touch realtime inference

Entry: **Pet right-click → ⚙️ Settings → Advanced**.

| State | Behavior |
|-------|----------|
| **Off** (default) | Prefer warmed cache; unwarmed lines may fall back to realtime synth |
| **On** | Every click is realtime TTS; no preheated wav |

Toggle is written to `.runtime/realtime-inference.env` (local, not committed).

### Where is the corpus? How do I migrate after upgrading?

Built-in defaults live in-repo at `src/data/corpus.json` (updated with new releases; usually no manual copy).

Custom content you **saved** in Voice Forge / the corpus editor lives under the project root:

| Path | Contents | On upgrade |
|------|----------|------------|
| `.runtime/corpus.custom.json` | **Active touch corpus** (lines by head/arms/body/legs/tail) | ✅ **Must copy** |
| `.runtime/touch-mode.env` | Touch mode (curated / Voice Forge / alt-engine) | ✅ Recommended |
| `.runtime/voice-forge.json` | Active voice, instruct overrides, etc. | ✅ Recommended |
| `voice_forge/custom_sample/{voiceId}/` | Custom clone voice (ref audio + corpus snapshot + warmup cache) | ✅ Copy whole folder |
| `voice_forge/default_sample/corpus.snapshot.json` | Corpus snapshot under the official default voice | Copy if you edited official-voice corpus |
| `voice_forge/other_custom_cache/{engine}/` | Third-party engine (e.g. bert_vits2) corpus & cache | Copy if you use that engine |

**Manual migration (no auto discovery of the old install):**

1. Quit the old TTS window and pet  
2. Copy the ✅ paths above into the **same relative paths** in the new project root  
3. Run `启动.bat` again  

Notes: corpus JSON shape matches `src/data/corpus.json`; if major fields are unchanged you can usually reuse as-is. Third-party engines also need private weights such as `tts_voice/bert/` (see `.gitignore` and `tts_voice/ENGINE_HOOKS.md`).

### TTS engines

Config: `tts_voice/config.yaml` (**restart TTS** after changing `engine`).

| Engine | Notes |
|--------|--------|
| `qwen` | **Default**. VoiceDesign 1.7B + Base 0.6B clone; Voice Forge |
| `bert_vits2` | Needs `Bert-VITS2/` + private weights |
| `style_bert_vits2` | Placeholder — PRs / Issues welcome |

Integration details: `tts_voice/ENGINE_HOOKS.md`.

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev-mode pet |
| `npm run build` | Build / package the app |
| `npm run setup:model` | Download / restore Live2D hiyori_pro |
| `npm run typecheck` | Vue/TS typecheck |
| `npm test` | Vitest unit tests |
| `npm run test:memory` | Memory SQLite integration tests (Node rebuild → test → restore Electron ABI) |
| `npm run test:tts` | TTS Python tests |
| `npm run tts` | Start TTS only |
| `npm run rebuild:native` | Rebuild native modules for Electron ABI (e.g. better-sqlite3) |

## Project layout (core)

```
Xue_CyberNeko/
├── electron/                 # Main process, preload, IPC, llama session
│   ├── main/chat/            # Chat window, chat-config, OpenAI proxy
│   ├── main/memory/          # Memory engine, schema, migrations (no user data)
│   ├── main/desire/          # Desire engine
│   ├── main/relationship/    # 3D affection
│   ├── main/petTouch/        # Pet-touch counts (optional closeness bump)
│   ├── main/stt/             # STT sidecar ensure / stop managed process
│   └── main/screenCompanion/ # Screen peek: Steam gate, capture summary, schedule, narrate
├── src/
│   ├── components/chat/      # Chat UI, TTS / LLM / STT / screen peek / character-card settings
│   ├── components/memory/    # Memory Space panel
│   ├── components/relationship/  # Affection panel
│   ├── components/petTouch/  # Today’s pet-touch card
│   ├── composables/chat/     # Session, entry, bootstrap, voice input
│   └── services/
│       ├── chat/             # LLM, TTS pipeline, character cards
│       ├── stt/              # STT client, capture, mic picker
│       ├── memory/           # Memory IPC client
│       ├── desire/           # Desire IPC client
│       ├── relationship/     # Affection IPC client
│       ├── petTouch/         # Pet-touch IPC client
│       └── screenCompanion/  # Screen-peek IPC client, narrate TTS pipeline
├── memory_service/           # Optional sidecar (summarization-related; no user DB)
├── stt_service/              # Local STT sidecar (speech → text)
├── tts_voice/                # FastAPI TTS + engines
├── voice_forge/              # Voice Forge samples
├── scripts/                  # Install, launch, benchmarks, memory test harness
├── public/models/            # Live2D (via setup:model)
├── public/touch_clips/       # Curated touch wavs
├── 首次安装.bat
├── 启动.bat
└── package.json
```

## Public docs index

| Doc | Description |
|-----|-------------|
| [`README.md`](README.md) | Chinese README (default) |
| [`README.en.md`](README.en.md) | English README (this file) |
| [`tts_voice/ENGINE_HOOKS.md`](tts_voice/ENGINE_HOOKS.md) | TTS engine hooks, cache, config.yaml |
| [`tts_voice/CONTRACT.md`](tts_voice/CONTRACT.md) | TTS service contract |
| [`src/services/chat/CONTRACT.md`](src/services/chat/CONTRACT.md) | Chat module contract |
| [`stt_service/CONTRACT.md`](stt_service/CONTRACT.md) | Voice input (STT) sidecar contract |
| [`electron/main/stt/CONTRACT.md`](electron/main/stt/CONTRACT.md) | STT ensure / stop-managed contract |
| [`electron/main/chat/CHAT_CONFIG.md`](electron/main/chat/CHAT_CONFIG.md) | chat-config fields (no real keys) |
| [`electron/main/memory/CONTRACT.md`](electron/main/memory/CONTRACT.md) | Memory contract (tables / IPC / retrieval; no user data) |
| [`electron/main/desire/CONTRACT.md`](electron/main/desire/CONTRACT.md) | Desire module contract |
| [`electron/main/relationship/CONTRACT.md`](electron/main/relationship/CONTRACT.md) | 3D affection contract |
| [`electron/main/petTouch/CONTRACT.md`](electron/main/petTouch/CONTRACT.md) | Pet-touch contract |
| [`electron/main/screenCompanion/CONTRACT.md`](electron/main/screenCompanion/CONTRACT.md) | Screen-peek contract (gate / observe / narrate / companion memory; no user data) |
| [`public/models/README.md`](public/models/README.md) | Replacing the Live2D model |
| [`voice_forge/README.md`](voice_forge/README.md) | Voice Forge directories |
| [`public/touch_clips/README.md`](public/touch_clips/README.md) | Curated audio manifest |

## License

This project is released under the [MIT License](LICENSE).

Maintainer commitment: this project will **not be commercialized** as a paid product or sold as exclusive rights. Voluntary sponsorship to support the developer personally is welcome. Third-party use of the code remains under the MIT terms in LICENSE.

## What’s next

The first emotion-simulation release is usable; next I’ll keep polishing it and plan STT (speech-to-text).

## Sponsorship

Afdian: https://ifdian.net/a/XueLan_Official  
Casual tips: [Alipay](donate/alipay.jpg) · [WeChat Pay](donate/wechat.png)

## A quiet aside

In practice the stack or architecture may shift with real usage. Milestone tech choices are directional only — development often means building whatever feels right next…
