# Model Selection Fix & Status UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the setup model mismatch bug, guard the hotkey against unconfigured models, and surface model download status + inline download in Settings.

**Architecture:** Four targeted changes across main process and renderer — no new files, no new screens. The `isModelDownloaded` helper in `setup.ts` drives all status checks. New IPC handlers bridge it to the renderer. The shortcut guard lives in the main process before any renderer involvement.

**Tech Stack:** Electron (main + renderer + preload), React, TypeScript, electron-store, HuggingFace hub cache at `~/.cache/huggingface/hub/`

> **No test infrastructure exists in this project.** Skip TDD steps; verify manually by running the app with `bun run dev` after each task.

---

## File Map

| File | What changes |
|------|-------------|
| `src/main/store.ts` | Change `whisperModel` default from `'mlx-community/whisper-large-v3-turbo'` to `''` |
| `src/main/setup.ts` | Add exported `isModelDownloaded(modelId: string): boolean` |
| `src/main/ipc.ts` | Save model after setup download; add `check-model-ready`, `get-model-status`, `download-model` handlers; add shortcut guard |
| `src/preload/index.ts` | Expose `checkModelReady`, `getModelStatus`, `downloadModel` |
| `src/renderer/src/App.tsx` | Add `modelReady` state + amber warning banner; re-check when leaving Settings tab |
| `src/renderer/src/components/Settings.tsx` | Add per-preset model status badges + inline download button; add Download button for custom model input |

---

## Task 1: Fix store default and save model selection during setup

**Files:**
- Modify: `src/main/store.ts:19`
- Modify: `src/main/ipc.ts:155-166`

- [ ] **Step 1: Change the default model in store.ts**

In `src/main/store.ts`, change line 19:

```typescript
// Before
whisperModel: 'mlx-community/whisper-large-v3-turbo',

// After
whisperModel: '',
```

- [ ] **Step 2: Save the model to settings after successful setup download**

In `src/main/ipc.ts`, update the `setup-download-model` handler (lines 155–166):

```typescript
ipcMain.handle('setup-download-model', async (_e, model: string) => {
  try {
    await downloadWhisperModel(model, (msg, type) => {
      mainWindow.webContents.send('setup-log', { msg, type })
    })
    setSetting('whisperModel', model)   // ← add this line
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    mainWindow.webContents.send('setup-log', { msg: `✕ ${message}`, type: 'error' })
    return { ok: false, error: message }
  }
})
```

- [ ] **Step 3: Verify the fix manually**

Run `bun run dev`. Go through setup, select Base model, download it. After setup completes, open Settings → Transcription. Confirm the Model field shows `mlx-community/whisper-base-mlx` instead of the large model. Also confirm that clicking Skip during the model download step leaves the model field blank.

---

## Task 2: Add `isModelDownloaded` utility and new IPC handlers

**Files:**
- Modify: `src/main/setup.ts` (add export at end of file)
- Modify: `src/main/ipc.ts` (add imports + three new handlers)
- Modify: `src/preload/index.ts` (expose three new methods)

- [ ] **Step 1: Add `isModelDownloaded` to setup.ts**

Add `homedir` to the existing `os` import (there is none yet — add a new import line at the top of `src/main/setup.ts` after the existing imports):

```typescript
import { homedir } from 'os'
```

Then append to the end of `src/main/setup.ts`:

```typescript
/**
 * Returns true if the model directory exists in the local HuggingFace cache.
 * HF stores models at ~/.cache/huggingface/hub/models--{org}--{name}
 * e.g. mlx-community/whisper-base-mlx → models--mlx-community--whisper-base-mlx
 */
export function isModelDownloaded(modelId: string): boolean {
  const cacheDir = join(homedir(), '.cache', 'huggingface', 'hub')
  const modelDir = 'models--' + modelId.replace('/', '--')
  return existsSync(join(cacheDir, modelDir))
}
```

- [ ] **Step 2: Import `isModelDownloaded` and `Notification` in ipc.ts**

Update the imports at the top of `src/main/ipc.ts`:

```typescript
// Change this line:
import { ipcMain, BrowserWindow, clipboard, shell, nativeTheme } from 'electron'
// To:
import { ipcMain, BrowserWindow, clipboard, shell, nativeTheme, Notification } from 'electron'
```

```typescript
// Change this line:
import {
  getSetupStatus,
  createVenvAndInstall,
  downloadModel as downloadWhisperModel,
  findPythonSync,
  getVenvPython
} from './setup'
// To:
import {
  getSetupStatus,
  createVenvAndInstall,
  downloadModel as downloadWhisperModel,
  findPythonSync,
  getVenvPython,
  isModelDownloaded
} from './setup'
```

- [ ] **Step 3: Add three new IPC handlers in ipc.ts**

Add these handlers in `src/main/ipc.ts` after the `'check-whisper'` handler (around line 127), in the `// ── Status checks ──` section:

```typescript
ipcMain.handle('check-model-ready', () => {
  const model = getSetting('whisperModel')
  const configured = model !== ''
  const downloaded = configured && isModelDownloaded(model)
  return { configured, downloaded }
})

ipcMain.handle('get-model-status', (_e, modelId: string) => {
  return { downloaded: isModelDownloaded(modelId) }
})

ipcMain.handle('download-model', async (_e, model: string) => {
  try {
    await downloadWhisperModel(model, (msg, type) => {
      mainWindow.webContents.send('setup-log', { msg, type })
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
})
```

- [ ] **Step 4: Expose the new methods in preload/index.ts**

Add to the `api` object in `src/preload/index.ts`, after the `checkOllama` entry:

```typescript
checkModelReady: (): Promise<{ configured: boolean; downloaded: boolean }> =>
  ipcRenderer.invoke('check-model-ready'),

getModelStatus: (modelId: string): Promise<{ downloaded: boolean }> =>
  ipcRenderer.invoke('get-model-status', modelId),

downloadModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
  ipcRenderer.invoke('download-model', model),
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors. Fix any type errors before continuing.

---

## Task 3: Shortcut guard + macOS notification

**Files:**
- Modify: `src/main/ipc.ts:169-177` (the `recordStart` event listener)

- [ ] **Step 1: Guard the recordStart listener**

In `src/main/ipc.ts`, replace the existing `recordStart` listener:

```typescript
// Before
shortcutEmitter.on('recordStart', () => {
  setTrayState('recording')
  mainWindow.webContents.send('record-start')
})

// After
shortcutEmitter.on('recordStart', () => {
  const model = getSetting('whisperModel')
  const configured = model !== ''
  const downloaded = configured && isModelDownloaded(model)

  if (!configured || !downloaded) {
    new Notification({
      title: 'jv-whisper',
      body: configured
        ? `Model "${model}" is not downloaded yet. Open the app to download it.`
        : 'No Whisper model configured. Open the app to set one up.'
    }).show()
    mainWindow.show()
    mainWindow.focus()
    return
  }

  setTrayState('recording')
  mainWindow.webContents.send('record-start')
})
```

- [ ] **Step 2: Verify manually**

Run `bun run dev`. With no model configured (clear `~/Library/Application Support/jv-whisper/config.json` or set `whisperModel` to `""` there), press the hotkey. Confirm:
- A macOS system notification appears
- The app window opens/focuses
- Recording does NOT start (no mic indicator, no beep)

---

## Task 4: Model-not-ready warning banner in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add modelReady state and checkModelReady callback**

In `src/renderer/src/App.tsx`, add to the existing state declarations (after line 20, alongside the other `useState` calls):

```typescript
const [modelReady, setModelReady] = useState(true) // optimistic — avoids flash on launch
```

Add a `checkModelReady` callback after the existing `useCallback` hooks (after `stopRecording`):

```typescript
const checkModelReady = useCallback(async () => {
  const status = await window.api.checkModelReady()
  setModelReady(status.configured && status.downloaded)
}, [])
```

- [ ] **Step 2: Call checkModelReady on launch (after setup check)**

Replace the existing setup status `useEffect` (lines 93–97):

```typescript
// Before
useEffect(() => {
  window.api.setupStatus().then((status) => {
    setScreen(status.packagesInstalled ? 'app' : 'setup')
  })
}, [])

// After
useEffect(() => {
  window.api.setupStatus().then(async (status) => {
    if (status.packagesInstalled) {
      setScreen('app')
      await checkModelReady()
    } else {
      setScreen('setup')
    }
  })
}, [checkModelReady])
```

- [ ] **Step 3: Re-check modelReady when user leaves Settings tab**

Add a new `useEffect` after the setup status one:

```typescript
useEffect(() => {
  if (tab === 'history' && screen === 'app') {
    checkModelReady()
  }
}, [tab, screen, checkModelReady])
```

- [ ] **Step 4: Add the warning banner to the JSX**

In the return statement of `App.tsx`, add the model-not-ready banner after the accessibility warning block and before the paste warning block (after line 217, before line 219):

```tsx
{/* Model not ready warning */}
{!modelReady && screen === 'app' && (
  <div className="mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm flex items-start gap-3">
    <span>
      <strong>⚠️ No Whisper model configured.</strong>{' '}
      <button
        onClick={() => setTab('settings')}
        className="underline hover:text-amber-200 transition-colors"
      >
        Go to Settings → Transcription
      </button>{' '}
      to download one.
    </span>
  </div>
)}
```

- [ ] **Step 5: Verify manually**

Run `bun run dev`. Set `whisperModel` to `""` in the config file at `~/Library/Application Support/jv-whisper/config.json`. Relaunch. Confirm the amber banner appears. Click the link — confirm Settings tab opens. Set a valid downloaded model — switch back to History tab — confirm banner disappears.

---

## Task 5: Settings model status badges and inline download

**Files:**
- Modify: `src/renderer/src/components/Settings.tsx`

- [ ] **Step 1: Add PRESET_MODELS constant (module-level) and model status state**

In `src/renderer/src/components/Settings.tsx`, add `PRESET_MODELS` at **module level** (outside the component function, near the top of the file after the imports). This avoids re-creating the array on every render:

```typescript
const PRESET_MODELS = [
  'mlx-community/whisper-tiny-mlx',
  'mlx-community/whisper-base-mlx',
  'mlx-community/whisper-large-v3-turbo'
] as const
```

Then inside the Settings component, alongside the other `useState` declarations, add:

```typescript
const [modelStatuses, setModelStatuses] = useState<Record<string, boolean>>({})
const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
const [downloadError, setDownloadError] = useState<string | null>(null)
```

- [ ] **Step 2: Fetch model statuses when Settings mounts**

Add a `useEffect` to fetch statuses for all presets:

```typescript
useEffect(() => {
  Promise.all(
    PRESET_MODELS.map(async (m) => {
      const { downloaded } = await window.api.getModelStatus(m)
      return [m, downloaded] as const
    })
  ).then((results) => {
    setModelStatuses(Object.fromEntries(results))
  })
}, [])
```

- [ ] **Step 3: Add a handleDownloadModel function**

```typescript
const handleDownloadModel = async (model: string) => {
  setDownloadError(null)
  setDownloadingModel(model)
  const result = await window.api.downloadModel(model)
  if (result.ok) {
    setModelStatuses((prev) => ({ ...prev, [model]: true }))
  } else {
    setDownloadError(result.error ?? 'Download failed')
  }
  setDownloadingModel(null)
}
```

- [ ] **Step 4: Replace the preset model buttons with status-aware versions**

Find the existing preset model buttons block in `Settings.tsx` (around lines 266–284):

```tsx
// Before
<div className="mt-1 flex gap-2 flex-wrap">
  {[
    'mlx-community/whisper-tiny-mlx',
    'mlx-community/whisper-base-mlx',
    'mlx-community/whisper-large-v3-turbo'
  ].map((m) => (
    <button
      key={m}
      onClick={() => updateSetting('whisperModel', m)}
      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
        settings.whisperModel === m
          ? 'border-white/25 text-gray-300 bg-white/8'
          : 'border-white/8 text-gray-600 hover:text-gray-400 hover:border-white/15'
      }`}
    >
      {m.split('/')[1].replace('whisper-', '').replace('-mlx', '')}
    </button>
  ))}
</div>

// After
<div className="mt-1 flex gap-2 flex-wrap">
  {PRESET_MODELS.map((m) => {
    const isDownloaded = modelStatuses[m]
    const isDownloading = downloadingModel === m
    const label = m.split('/')[1].replace('whisper-', '').replace('-mlx', '')
    return (
      <div key={m} className="flex items-center gap-1">
        <button
          onClick={() => updateSetting('whisperModel', m)}
          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
            settings.whisperModel === m
              ? 'border-white/25 text-gray-300 bg-white/8'
              : 'border-white/8 text-gray-600 hover:text-gray-400 hover:border-white/15'
          }`}
        >
          {label}
        </button>
        {isDownloaded ? (
          <span className="text-[10px] text-green-500/80" title="Downloaded">✓</span>
        ) : isDownloading ? (
          <span className="text-[10px] text-amber-400" title="Downloading…">⏳</span>
        ) : (
          <button
            onClick={() => handleDownloadModel(m)}
            className="text-[10px] text-blue-400/80 hover:text-blue-300 underline transition-colors"
            title={`Download ${label}`}
          >
            dl
          </button>
        )}
      </div>
    )
  })}
</div>
```

- [ ] **Step 5: Add Download button for custom model input**

Find the model text input (around line 260–265). Replace the `<input>` element with a flex row that includes a Download button for non-preset model IDs:

```tsx
// Before
<input
  type="text"
  value={settings.whisperModel}
  onChange={(e) => updateSetting('whisperModel', e.target.value)}
  className="mt-2 w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-white/25 font-mono"
/>

// After
<div className="mt-2 flex gap-2">
  <input
    type="text"
    value={settings.whisperModel}
    onChange={(e) => updateSetting('whisperModel', e.target.value)}
    className="flex-1 bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-white/25 font-mono"
  />
  {settings.whisperModel &&
    !(PRESET_MODELS as readonly string[]).includes(settings.whisperModel) && (
      <button
        onClick={() => handleDownloadModel(settings.whisperModel)}
        disabled={downloadingModel === settings.whisperModel}
        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-50 shrink-0"
      >
        {downloadingModel === settings.whisperModel ? '⏳' : 'Download'}
      </button>
    )}
</div>
```

- [ ] **Step 6: Show download error if one occurs**

After the preset buttons block (and before the Python path section), add an error display:

```tsx
{downloadError && (
  <p className="text-xs text-red-400 mt-1">⚠️ {downloadError}</p>
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 8: Verify manually**

Run `bun run dev`. Open Settings → Transcription. Confirm:
- Downloaded models show a green ✓ next to their preset button
- Non-downloaded models show a "dl" link
- Clicking "dl" triggers a download; the ✓ appears when done
- A custom HF repo ID in the text input shows a "Download" button
- If a download fails, the error message appears below the preset buttons

---

## Wrap-up

- [ ] Run `bun run typecheck` — confirm no errors
- [ ] Run `bun audit` — surface any new critical/high vulnerabilities
- [ ] Review `README.md` at the repo root and `docs/` — update if any setup instructions reference the default model
