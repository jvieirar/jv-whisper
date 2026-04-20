# Model Selection Fix & Status UI — Design Spec

**Date:** 2026-04-17
**Status:** Approved

---

## Problem

Two related bugs:

1. **Setup mismatch**: When the user selects a model during setup (e.g., Base), it gets downloaded but is never saved to settings. The default in `store.ts` is hardcoded to `mlx-community/whisper-large-v3-turbo`. After setup, the app silently tries to use the large model — which was never downloaded — causing transcription to hang indefinitely.

2. **No feedback**: The app provides no indication that the configured model is missing, and no way to download models from within Settings.

---

## Solution Overview (Option B)

Four targeted changes, no new screens or tabs:

1. Save the setup model selection to settings (bug fix)
2. Show a persistent warning banner in the main app when no valid model is configured
3. Guard the hotkey — abort and notify via macOS notification if model is missing
4. Add download status badges and inline download to the Settings model section

---

## Section 1 — Setup Fix

**Files:** `src/main/ipc.ts`, `src/main/store.ts`

- In `ipc.ts`, the `setup-download-model` IPC handler downloads the model but never persists it. After download completes, add: `setSetting('whisperModel', model)`.
- In `store.ts`, change the default value of `whisperModel` from `'mlx-community/whisper-large-v3-turbo'` to `""` (empty string). This ensures new installs start unconfigured rather than pointing at a model the user may not have downloaded.
- If the user skips the model download step during setup, `whisperModel` remains `""`.

---

## Section 2 — Warning Banner in Main App

**Files:** `src/main/ipc.ts`, `src/renderer/src/App.tsx`

New IPC handler: `check-model-ready`
- Returns `{ configured: boolean, downloaded: boolean }`
- `configured`: `whisperModel !== ""`
- `downloaded`: checks whether the model directory exists in `~/.cache/huggingface/hub/`. HuggingFace stores models at `models--{org}--{model-name}` (slashes replaced with `--`), e.g. `mlx-community/whisper-base-mlx` → `~/.cache/huggingface/hub/models--mlx-community--whisper-base-mlx`

Banner behavior in `App.tsx`:
- Shown when `check-model-ready` returns `configured: false` OR `downloaded: false`
- Same amber style as the existing `parsingWarning` banner
- Message: _"No Whisper model configured. Go to Settings → Transcription to download one."_
- Clicking the banner opens Settings scrolled to the Transcription section
- Banner disappears after the user selects and downloads a model (re-checked when returning from Settings)
- Checked on app launch and each time the Settings panel closes

---

## Section 3 — Shortcut Guard + macOS Notification

**Files:** `src/main/ipc.ts` (hotkey / transcription trigger)

Before spawning the transcription process, run the `check-model-ready` logic directly in the main process:

- If `configured` or `downloaded` is false:
  1. Abort — do not spawn Python at all
  2. Fire a macOS system notification via Electron's `new Notification({ title: 'jv-whisper', body: 'No Whisper model set up. Open the app to configure one.' }).show()`
  3. Show and focus the app window so the warning banner is visible

The transcription pipeline (`src/main/transcriber.ts`) is not modified.

---

## Section 4 — Settings: Model Status + Inline Download

**Files:** `src/main/ipc.ts`, `src/renderer/src/components/Settings.tsx`

New IPC handler: `get-model-status`
- Accepts a model repo ID string
- Returns `{ downloaded: boolean }`
- Checks `~/.cache/huggingface/hub/` for the model directory

Settings UI changes:
- Each of the three preset model buttons fetches its status via `get-model-status` when the Settings panel opens
- **If downloaded**: show a green "Downloaded" badge on the button
- **If not downloaded**: show a "Download" button that triggers the existing download logic (the `downloadModel` function from `src/main/setup.ts` is extracted into a shared helper called by both the setup IPC handler and this new settings download handler), with a spinner while in progress
- The custom HF repo text input gets a "Check & Download" button that validates the repo ID, checks the cache, and downloads if missing
- No "Refresh" button needed — status updates automatically after a download completes

---

## Data Flow

```
App launch / Settings close
  → renderer calls check-model-ready
  → main reads whisperModel from store
  → main checks ~/.cache/huggingface/hub/
  → returns { configured, downloaded }
  → renderer shows/hides warning banner

Hotkey pressed
  → main checks model-ready inline
  → if not ready: Notification.show() + focus window → abort
  → if ready: spawn transcriber as normal

Settings opens
  → renderer calls get-model-status(modelId) for each preset
  → shows Downloaded badge or Download button

Download button clicked (in Settings)
  → reuses existing download IPC handler
  → sets whisperModel on success
  → re-checks status → badge appears
```

---

## What is NOT changing

- The transcription pipeline (`transcriber.ts`) — no changes
- The setup wizard UI (`Setup.tsx`) — no structural changes, only the IPC handler saves the result
- The three preset model options — same list as today
- No new Settings tabs or screens

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/main/store.ts` | Change `whisperModel` default to `""` |
| `src/main/ipc.ts` | Save model in setup handler; add `check-model-ready` and `get-model-status` handlers; add shortcut guard |
| `src/renderer/src/App.tsx` | Add model-not-ready warning banner; call `check-model-ready` on load and Settings close |
| `src/renderer/src/components/Settings.tsx` | Add status badges and inline download to preset model buttons and custom input |
