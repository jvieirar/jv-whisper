import { contextBridge, ipcRenderer } from 'electron'

export interface TranscriptionRecord {
  id: number
  text: string
  raw_text: string
  model: string
  duration_ms: number
  advanced_parsing: number
  created_at: string
  session_id: string
}

export interface Settings {
  hotkey: string
  hotkeySwitchMode: 'hold' | 'toggle'
  whisperModel: string
  whisperPythonPath: string
  advancedParsingEnabled: boolean
  advancedParsingModel: string
  soundEnabled: boolean
  autoCopyToClipboard: boolean
  theme: 'system' | 'light' | 'dark'
  hfToken: string
}

const api = {
  // ── Transcription ──────────────────────────────────────────────────────────
  transcribe: (audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke('transcribe', audioBuffer),

  // ── History ────────────────────────────────────────────────────────────────
  getHistory: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-history', limit, offset),
  searchHistory: (query: string) =>
    ipcRenderer.invoke('search-history', query),
  deleteTranscription: (id: number) =>
    ipcRenderer.invoke('delete-transcription', id),
  clearHistory: () =>
    ipcRenderer.invoke('clear-history'),
  copyText: (text: string) =>
    ipcRenderer.invoke('copy-text', text),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke('get-settings'),
  setSetting: (key: keyof Settings, value: unknown) =>
    ipcRenderer.invoke('set-setting', key, value),

  // ── Status ─────────────────────────────────────────────────────────────────
  checkWhisper: (): Promise<{ available: boolean; version?: string; error?: string }> =>
    ipcRenderer.invoke('check-whisper'),
  checkOllama: (): Promise<boolean> =>
    ipcRenderer.invoke('check-ollama'),
  getOllamaModels: (): Promise<Array<{ name: string; size: number; modified_at: string }>> =>
    ipcRenderer.invoke('get-ollama-models'),

  // ── Setup ──────────────────────────────────────────────────────────────────
  setupStatus: (): Promise<{
    pythonFound: boolean
    pythonPath: string
    venvExists: boolean
    packagesInstalled: boolean
    venvPython: string
  }> => ipcRenderer.invoke('setup-status'),

  setupFindPython: (): Promise<string | null> =>
    ipcRenderer.invoke('setup-find-python'),

  setupInstall: (pythonPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('setup-install', pythonPath),

  setupDownloadModel: (model: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('setup-download-model', model),

  onSetupLog: (cb: (entry: { msg: string; type?: 'info' | 'success' | 'error' }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, entry: { msg: string; type?: string }) =>
      cb(entry as { msg: string; type?: 'info' | 'success' | 'error' })
    ipcRenderer.on('setup-log', handler)
    return () => { ipcRenderer.off('setup-log', handler) }
  },

  // ── Events from main process ───────────────────────────────────────────────
  onRecordStart: (cb: () => void) => {
    ipcRenderer.on('record-start', cb)
    return () => { ipcRenderer.off('record-start', cb) }
  },
  onRecordStop: (cb: () => void) => {
    ipcRenderer.on('record-stop', cb)
    return () => { ipcRenderer.off('record-stop', cb) }
  },
  onProcessingStart: (cb: () => void) => {
    ipcRenderer.on('processing-start', cb)
    return () => { ipcRenderer.off('processing-start', cb) }
  },
  onProcessingEnd: (cb: () => void) => {
    ipcRenderer.on('processing-end', cb)
    return () => { ipcRenderer.off('processing-end', cb) }
  },
  onTranscriptionComplete: (cb: (record: TranscriptionRecord) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, record: TranscriptionRecord) => cb(record)
    ipcRenderer.on('transcription-complete', handler)
    return () => { ipcRenderer.off('transcription-complete', handler) }
  },
  onTranscriptionError: (cb: (msg: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('transcription-error', handler)
    return () => { ipcRenderer.off('transcription-error', handler) }
  },
  onAccessibilityError: (cb: () => void) => {
    ipcRenderer.on('accessibility-error', cb)
    return () => { ipcRenderer.off('accessibility-error', cb) }
  },
  onAdvancedParsingFailed: (cb: (msg: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('advanced-parsing-failed', handler)
    return () => { ipcRenderer.off('advanced-parsing-failed', handler) }
  },
  openAccessibilitySettings: () =>
    ipcRenderer.invoke('open-accessibility-settings'),
  onPasteFailed: (cb: (msg: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('paste-failed', handler)
    return () => { ipcRenderer.off('paste-failed', handler) }
  },
  onThemeChanged: (cb: (payload: { isDark: boolean }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { isDark: boolean }) => cb(payload)
    ipcRenderer.on('theme-changed', handler)
    return () => { ipcRenderer.off('theme-changed', handler) }
  },
  getNativeTheme: (): Promise<boolean> => ipcRenderer.invoke('get-native-theme'),

  // ── Hotkey capture ─────────────────────────────────────────────────────────
  startHotkeyCapture: () => ipcRenderer.invoke('start-hotkey-capture'),
  stopHotkeyCapture: () => ipcRenderer.invoke('stop-hotkey-capture'),
  onHotkeyCaptureUpdate: (cb: (combo: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, combo: string) => cb(combo)
    ipcRenderer.on('hotkey-capture-update', handler)
    return () => { ipcRenderer.off('hotkey-capture-update', handler) }
  },
  onHotkeyCaptured: (cb: (combo: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, combo: string) => cb(combo)
    ipcRenderer.on('hotkey-captured', handler)
    return () => { ipcRenderer.off('hotkey-captured', handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
