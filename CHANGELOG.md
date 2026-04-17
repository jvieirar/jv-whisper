# Changelog

All notable changes to jv-whisper will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] - 2026-04-17

### Added
- Menu bar tray app (macOS)
- Hold-key and toggle recording modes
- Global hotkey configuration (default: `Control+Space`)
- Transcription via mlx-whisper (Apple Silicon optimized)
- Auto-copy transcription to clipboard
- Persistent history with SQLite, grouped by session
- Optional AI cleanup via Ollama (Gemma and other models)
- Settings UI: hotkey, model, Python path, HuggingFace token, Ollama config
- Support for `whisper-tiny`, `whisper-base`, and `whisper-large-v3-turbo` models
