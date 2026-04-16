# Porting jv-whisper to Windows & Linux

Status: draft
Date: 2026-04-16
Author: jv + notes

---

Goal
----
Provide a practical, minimal-effort path to run jv-whisper on Windows and Linux with feature parity for core functionality:
- local-only transcription (no cloud)
- global hold-key recording (hotkey)
- tray/menu integration
- paste-into-focused-field (no clipboard theft preferred)
- persisted history (libsql)
- optional advanced parsing (Ollama) when available

High-level recommendation
------------------------
Use a cross-platform inference backend and platform-specific small adapters for paste and hotkeys. Two solid backend choices:

1. whisper.cpp (GGML CLI)
   - Pros: pure C/C++ binary, easy to build for each platform, no Python runtime required, runs on CPU, very portable
   - Cons: model format is GGML (need converted models), some features differ from mlx-whisper
   - Recommended for V1 cross-platform port because it simplifies distribution (no Python/venv)

2. faster-whisper (Python / PyTorch)
   - Pros: good parity with OpenAI Whisper features; supports GPU if present
   - Cons: heavy Python + PyTorch install steps; Windows and Linux packaging becomes more complex
   - Use if GPU support and model parity are higher priority than packaging simplicity

Suggested path: implement a small engine abstraction and ship whisper.cpp adapters for Windows and Linux as the primary path. Keep current mlx-whisper adapter for macOS.

Architecture changes (high level)
---------------------------------
Introduce an `engine` abstraction in the main process:

- src/main/engine.ts (interface)
  - checkAvailable(): Promise<boolean>
  - transcribe(filePath, model?): Promise<TranscriptionResult>
  - prepareModel(model, progressCb?): Promise<void>

- Implementations:
  - engines/mlx-whisper (existing)
  - engines/whisper-cpp (new)
  - engines/faster-whisper (optional)

The main ipc handler keeps the same API; it uses engine.transcribe() instead of spawning transcribe.py directly.

Detailed tasks
--------------

1) Engine abstraction (1-2 days)
- Add interface + wiring in ipc.ts to use `getEngine()` based on platform and settings
- Move platform-specific model download/prepare logic behind engine.prepareModel()

2) whisper.cpp adapter (2-5 days)
- Build whisper.cpp in repo or as CI artifact for win32/x64 and linux (x86_64) and linux-arm if needed.
- Provide a tiny wrapper binary (whisper-cpp-runner) that:
  - accepts: input WAV path, model path, options
  - writes structured JSON to stdout (text, language, timestamps) or plain text that is parsed by the adapter
- Add models section in Settings to accept GGML model paths
- Packaging: include platform binaries in `extraResources/engines/whispercpp/<platform>/` and reference them via `process.resourcesPath`
- Model files: store outside the app (userData) or instruct users to download converted GGML models

Key build commands (examples):
- Linux: `cmake -B build -S . && cmake --build build -j` (depends on repo)
- Windows: use MSYS2 / Visual Studio toolchain or use CI to cross-compile

3) Audio conversion and ffmpeg (1 day)
- whisper.cpp expects WAV/PCM; keep using ffmpeg for conversions
- For packaged apps, bundle static ffmpeg executables per platform under `extraResources/tools/ffmpeg/<platform>/` and add that path to PATH when spawning engines (same approach as mac fix)
- Ensure code checks for ffmpeg in PATH, fallback to bundled copy if present

4) Hotkeys & global keydown/keyup (1-3 days)
- uiohook-napi is cross-platform; keep it but validate prebuilt binaries are included per platform
- As fallback, provide `electron.globalShortcut` limited-mode (only supports keydown events, not keyup) and show a settings toggle with notes
- Packaging: ensure `asarUnpack` includes uiohook native modules so they are loaded at runtime

5) Paste / inject text into focused window (2-4 days)
Multiple platform-specific strategies—implement abstraction `injectText(text)` with per-platform adapters:

- macOS: keep osascript or native CGEvent injector
- Windows
  - Preferred: small native helper (Rust/C++) that reads UTF-8 from stdin and injects via Win32 `SendInput` (supports unicode via `SendInput` on Windows 10+ or via clipboard + simulated paste as a fallback)
  - Alternative: use PowerShell + SendKeys (less reliable)
- Linux
  - X11: xdotool or `xdotool type --clearmodifiers "text"`
  - Wayland: use `wtype` (depends on compositor) or `xdg-desktop-portal`-based injection; Wayland is trickier—offer clipboard fallback or require `wtype`/`wl-clipboard`

Packaging: include small native 'injector' binaries for each platform in `extraResources/injectors/<platform>/injector` and call them via child_process with the text on stdin. This avoids using the system clipboard.

6) Permissions & UX (0.5 day)
- Windows: microphone prompt appears on first getUserMedia; Accessibility-like permission is not centralized—test uiohook behavior; document steps if admin privileges or explicit allow are required
- Linux: no uniform privacy dialog; document pulseaudio/pipewire requirements and Wayland/X11 limitations

7) Packaging (1-3 days)
- Windows:
  - electron-builder `win` target: NSIS (installer) or portable
  - `build.extraResources` to include engines, ffmpeg, injectors
  - `asarUnpack` for native node modules
  - code sign with signtool (recommended) for distribution
- Linux:
  - electron-builder `linux` targets: AppImage (recommended), deb, rpm
  - include extraResources, and ensure AppImage contains bundled binaries or instruct apt install ffmpeg

8) CI for cross-platform builds (2-4 days)
- GitHub Actions matrix: macos-latest, windows-latest, ubuntu-latest
- Build whisper.cpp per platform or produce prebuilt binaries and store as artifacts
- Build Electron apps with platform-specific steps, signers (secrets required)

9) Advanced parsing (Ollama) notes
- Ollama runs on macOS and Linux; remain an optional feature that the user can enable when Ollama is available
- For Windows, Ollama support is currently limited — document as optional, fallback to local parsing options

10) Testing & QA (1-2 days)
- Tests to run per platform:
  - record → transcribe accuracy
  - hold-hotkey behavior (press/hold/release)
  - paste injection into multiple target apps (Notepad, browser, Slack)
  - micro permission prompt flow
  - ffmpeg present / missing handling
  - fallback when injector fails (clipboard fallback)

Effort estimate (rough)
-----------------------
- Minimal Windows-only port (whisper.cpp, inject via small binary, bundle ffmpeg, include uiohook): ~1 week (dev + CI + manual testing)
- Windows + mainstream Linux (Ubuntu) with X11 support: ~2 weeks
- Full Linux (Wayland support) + GPU accelerated faster-whisper path: +1-2 weeks (complexity mostly in packaging and install guides for PyTorch)

Implementation checklist (concrete files to touch)
-------------------------------------------------
- src/main/engine.ts (new) — engine interface
- src/main/engines/whisper_cpp_adapter.ts (new)
- src/main/engines/faster_whisper_adapter.ts (optional)
- src/main/transcriber.ts → refactor to use engine abstraction
- src/main/setup.ts → add `install-whispercpp` helper or instructions
- src/main/shortcuts.ts → ensure cross-platform support & packaging hints
- src/main/injector/* → call native injector binary from main process
- package.json build config → add per-platform extraResources and asarUnpack
- build/ci/** → GitHub Actions workflows for win/linux/mac

Distribution & user instructions (what to ship vs what user installs)
---------------------------------------------------------------------
- Ship: app (.exe/.app/AppImage) + platform binaries (ffmpeg, whisper.cpp runner, injector)
- Do not ship: large models (download on-demand into userData) — provide a model manager UI similar to mac setup
- Document per-platform dependencies where necessary (e.g., apt install ffmpeg for some Linux distros)

Risks & notes
-------------
- Wayland support is the biggest friction for paste injection on Linux — plan for clipboard fallback if automatic injection fails
- Packaging native modules (uiohook) requires building on target platforms or using prebuilds — CI must produce these
- GPU path requires heavy dependency management (CUDA) — prefer CPU-only fallback for V1

Useful links
------------
- whisper.cpp (GGML): https://github.com/ggerganov/whisper.cpp
- faster-whisper: https://github.com/guillaumekln/faster-whisper
- enigo (Rust input): https://github.com/enigo-rs/enigo
- electron-builder docs: https://www.electron.build/

Next concrete steps (suggested)
------------------------------
1. Add `src/main/engine.ts` and refactor `transcriber.ts` to call engine interface (low risk)
2. Implement whisper.cpp adapter that spawns a packaged whisper-cpp runner binary (small adapter)
3. Create and bundle injectors (Rust enigo) for Windows and Linux (prototype for Windows first)
4. Add electron-builder extraResources for engines and ffmpeg; add `package:win:quick` and `package:linux:quick` scripts
5. Create CI job that builds whisper.cpp per platform and produces builder artifacts

If you want, I can start by generating `src/main/engine.ts` + a stub whisper-cpp adapter and a small injector wrapper for Windows (Rust) as a PoC. Which target is the priority: Windows first, or Linux first?
