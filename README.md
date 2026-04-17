# jv-whisper

> Local, free, offline speech-to-text. Hold a key → speak → text lands in your clipboard.

Built with **Electron + Whisper (mlx-whisper on Apple Silicon)**. No internet. No subscriptions. No API keys.

---

## Features

- 🎙️ **Menu bar app** — tiny tray icon, always accessible
- ⌨️ **Hold-key recording** — hold a hotkey to record, release to transcribe
- 📋 **Auto-copy** — transcription lands in clipboard instantly
- 🕐 **Persistent history** — all sessions saved in SQLite, searchable, per-session grouping
- 🧠 **Advanced parsing** *(optional)* — post-process with Gemma/any Ollama model for cleanup
- ⚙️ **Settings UI** — configure hotkey, model, mode, everything in-app

---

## Prerequisites

Install these before anything else:

### 1. Node.js 18+
```bash
brew install node
# or via nvm: nvm install --lts
```

### 2. Python 3.9+
Already on your Mac. Verify: `python3 --version`

### 3. ffmpeg (for audio conversion)
```bash
brew install ffmpeg
```

### 4. pip packages for transcription
```bash
pip install -r requirements.txt
```

> **Note:** `mlx-whisper` uses Apple's [MLX framework](https://github.com/ml-explore/mlx) — it's heavily optimized for Apple Silicon (M1/M2/M3/M4). On Intel Macs, use `openai-whisper` instead and update the `scripts/transcribe.py` import accordingly.

---

## Installation

```bash
# Clone the repo
git clone https://github.com/jvieirar/jv-whisper jv-whisper
cd jv-whisper

# Install Node dependencies
npm install
```

---

## Running in Development

```bash
npm run dev
```

The app will open with DevTools attached. The tray icon (🎙) will appear in your menu bar.

---

## macOS Permissions (Required)

The app needs two system permissions:

### 1. Microphone
macOS will prompt you automatically on first recording attempt. If it doesn't:
> **System Settings → Privacy & Security → Microphone** → enable for jv-whisper (or Electron in dev)

### 2. Accessibility (for global hotkeys)
`uiohook-napi` requires Accessibility access to detect key presses system-wide.

> **System Settings → Privacy & Security → Accessibility** → add and enable Electron (dev) or jv-whisper.app (production)

Without this, the global hotkey **will not work**.

---

## Downloading Whisper Models

Models are downloaded automatically on first use from HuggingFace. No manual step needed.

**On first transcription**, expect a ~30s wait while the model downloads (~800MB for the default `whisper-large-v3-turbo`).

### Available models (pick in Settings):

| Model | Size | Speed | Quality |
|---|---|---|---|
| `mlx-community/whisper-tiny-mlx` | 39 MB | ⚡⚡⚡ | ★★☆ |
| `mlx-community/whisper-base-mlx` | 74 MB | ⚡⚡ | ★★★ |
| `mlx-community/whisper-large-v3-turbo` | 809 MB | ⚡ | ★★★★ (default) |

Models are cached at `~/.cache/huggingface/hub/` after first download.

### Pre-download a model manually:
```bash
python3 -c "import mlx_whisper; mlx_whisper.transcribe('/dev/null', path_or_hf_repo='mlx-community/whisper-large-v3-turbo')"
```

---

## Configuring the Hotkey

Default: **Control + Space**

To change it, open **Settings → Recording → Hotkey** and type a new combo using `+` as separator.

Supported modifiers: `Control`, `Shift`, `Alt`, `Meta` (Cmd)
Supported keys: `Space`, `F1`–`F12`, single letters

**Examples:**
- `Control+Space` — Ctrl + Space
- `Meta+Shift+Space` — Cmd + Shift + Space  
- `F5` — just F5

**Modes:**
- **Hold** — hold the key combo to record, release to transcribe *(default)*
- **Toggle** — press once to start, press again to transcribe

---

## Advanced Parsing with Ollama (Optional)

Uses a local LLM to clean up transcriptions — removes filler words, fixes punctuation, improves readability. **Disabled by default.**

### Setup:
```bash
# Install Ollama
brew install ollama

# Start the Ollama server
ollama serve

# Pull a model (Gemma 4 when available, or use Gemma 3 now)
ollama pull gemma3:12b
# or the lighter version
ollama pull gemma3:4b
```

Then in the app:
1. Go to **Settings → Advanced Parsing**
2. Toggle **Enable AI cleanup** on
3. Click **Check** to verify Ollama is running
4. Select your model from the dropdown
5. Done — every transcription will be post-processed

> ⚡ Adds ~2–5s per transcription depending on model size.

---

## Building as a macOS App (.dmg)

```bash
# Build for Apple Silicon
npm run package:mac

# Build universal (runs on both Intel + Apple Silicon)
npm run package:mac:universal
```

Output: `dist/jv-whisper-1.0.0-arm64.dmg`

### App icon (optional)
To add a proper icon:
1. Create a 1024×1024 PNG at `assets/icon.png`
2. Convert to `.icns`: `sips -s format icns assets/icon.png --out assets/icon.icns`
3. Uncomment the `icon` line in `electron-builder.config.ts`

---

## Project Structure

```
jv-whisper/
├── src/
│   ├── main/               # Electron main process (Node.js)
│   │   ├── index.ts        # App entry
│   │   ├── tray.ts         # Menu bar tray icon
│   │   ├── windows.ts      # BrowserWindow management
│   │   ├── database.ts     # SQLite history (better-sqlite3)
│   │   ├── transcriber.ts  # Whisper via Python subprocess
│   │   ├── ollama.ts       # Ollama API for advanced parsing
│   │   ├── shortcuts.ts    # Global hotkeys (uiohook-napi)
│   │   ├── store.ts        # Settings persistence (electron-store)
│   │   └── ipc.ts          # All IPC handlers
│   ├── preload/
│   │   └── index.ts        # contextBridge API bridge
│   └── renderer/           # React UI
│       └── src/
│           ├── App.tsx               # Shell + recording orchestration
│           └── components/
│               ├── History.tsx       # Transcription history list
│               ├── Settings.tsx      # Settings panel
│               └── RecordingIndicator.tsx
├── scripts/
│   └── transcribe.py       # Python Whisper runner
└── assets/                 # Icons and sounds
```

---

## Troubleshooting

### Hotkey not working
- Grant **Accessibility** permission (System Settings → Privacy & Security → Accessibility)
- In dev mode, add **Electron** to Accessibility; in production, add **jv-whisper**
- Restart the app after granting permission

### "Python not found" error
- Open **Settings → Transcription → Python path**
- Change to your full Python path: `which python3` → e.g. `/opt/homebrew/bin/python3`

### "mlx-whisper not installed"
```bash
pip3 install mlx-whisper soundfile
```

### Model download stuck / slow
- First download is 800MB for the default model — be patient
- Switch to `whisper-tiny-mlx` for instant start in Settings

### Microphone permission denied
- System Settings → Privacy & Security → Microphone → enable for Electron/jv-whisper
- Restart the app

### Ollama model not showing
- Make sure Ollama is running: `ollama serve`
- Click **Check** in Settings → Advanced Parsing to refresh

---

## Tech Stack

| Layer | Library |
|---|---|
| Desktop shell | [Electron](https://electronjs.org) |
| Build tooling | [electron-vite](https://electron-vite.org) |
| UI framework | [React 18](https://react.dev) + [Tailwind CSS](https://tailwindcss.com) |
| Speech-to-text | [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) |
| History DB | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Settings | [electron-store](https://github.com/sindresorhus/electron-store) |
| Global hotkeys | [uiohook-napi](https://github.com/SnosMe/uiohook-napi) |
| LLM (optional) | [Ollama](https://ollama.com) |

---

## License

MIT — do whatever you want with it.
