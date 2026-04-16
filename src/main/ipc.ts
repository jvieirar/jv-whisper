import { ipcMain, BrowserWindow, clipboard } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

import { transcribeAudio, checkWhisperAvailable } from './transcriber'
import { isOllamaRunning, getOllamaModels, runAdvancedParsing } from './ollama'
import {
  getSetupStatus,
  createVenvAndInstall,
  downloadModel as downloadWhisperModel,
  findPythonSync,
  getVenvPython
} from './setup'
import {
  saveTranscription,
  getTranscriptions,
  deleteTranscription,
  clearHistory,
  searchTranscriptions
} from './database'
import { getSetting, setSetting, getAllSettings, Settings } from './store'
import { shortcutEmitter, restartShortcutListener } from './shortcuts'
import { setTrayState } from './tray'

const SESSION_ID = randomUUID()

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── Transcription ──────────────────────────────────────────────────────────
  ipcMain.handle('transcribe', async (_e, audioBuffer: ArrayBuffer) => {
    setTrayState('processing')
    mainWindow.webContents.send('processing-start')

    try {
      // Save audio to temp file
      const tmpDir = join(tmpdir(), 'jv-whisper')
      mkdirSync(tmpDir, { recursive: true })
      const tmpFile = join(tmpDir, `rec-${Date.now()}.webm`)
      writeFileSync(tmpFile, Buffer.from(audioBuffer))

      const result = await transcribeAudio(tmpFile)

      let finalText = result.text

      // Advanced parsing via Ollama (optional)
      if (getSetting('advancedParsingEnabled')) {
        try {
          finalText = await runAdvancedParsing(result.text)
        } catch (err) {
          console.error('[ipc] Advanced parsing failed:', err)
          // Fall back to raw whisper output
        }
      }

      if (getSetting('autoCopyToClipboard')) {
        clipboard.writeText(finalText)
      }

      const record = await saveTranscription({
        text: finalText,
        raw_text: result.text,
        model: getSetting('whisperModel'),
        duration_ms: result.duration_ms,
        advanced_parsing: getSetting('advancedParsingEnabled') ? 1 : 0,
        session_id: SESSION_ID
      })

      mainWindow.webContents.send('transcription-complete', record)
      return { ok: true, record }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('transcription-error', message)
      return { ok: false, error: message }
    } finally {
      setTrayState('idle')
      mainWindow.webContents.send('processing-end')
    }
  })

  // ── History ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-history', (_e, limit = 100, offset = 0) =>
    getTranscriptions(limit, offset)
  )
  ipcMain.handle('search-history', (_e, query: string) => searchTranscriptions(query))
  ipcMain.handle('delete-transcription', (_e, id: number) => deleteTranscription(id))
  ipcMain.handle('clear-history', () => clearHistory())
  ipcMain.handle('copy-text', (_e, text: string) => clipboard.writeText(text))

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle('get-settings', () => getAllSettings())

  ipcMain.handle('set-setting', (_e, key: keyof Settings, value: unknown) => {
    setSetting(key, value as never)
    // Restart shortcut listener if hotkey config changes
    if (key === 'hotkey' || key === 'hotkeySwitchMode') {
      restartShortcutListener()
    }
  })

  // ── Status checks ──────────────────────────────────────────────────────────
  ipcMain.handle('check-whisper', () => checkWhisperAvailable())
  ipcMain.handle('check-ollama', () => isOllamaRunning())
  ipcMain.handle('get-ollama-models', () => getOllamaModels())

  // ── Setup / onboarding ────────────────────────────────────────────────────
  ipcMain.handle('setup-status', () => getSetupStatus())

  ipcMain.handle('setup-find-python', () => findPythonSync())

  ipcMain.handle('setup-install', async (_e, pythonPath: string) => {
    try {
      await createVenvAndInstall(pythonPath, (msg, type) => {
        mainWindow.webContents.send('setup-log', { msg, type })
      })
      // Auto-update the whisperPythonPath to our managed venv
      setSetting('whisperPythonPath', getVenvPython())
      mainWindow.webContents.send('setup-log', {
        msg: '✓ Environment ready',
        type: 'success'
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('setup-log', { msg: `✕ ${message}`, type: 'error' })
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('setup-download-model', async (_e, model: string) => {
    try {
      await downloadWhisperModel(model, (msg, type) => {
        mainWindow.webContents.send('setup-log', { msg, type })
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('setup-log', { msg: `✕ ${message}`, type: 'error' })
      return { ok: false, error: message }
    }
  })

  // ── Hotkey events → renderer ───────────────────────────────────────────────
  shortcutEmitter.on('recordStart', () => {
    setTrayState('recording')
    mainWindow.webContents.send('record-start')
  })

  shortcutEmitter.on('recordStop', () => {
    mainWindow.webContents.send('record-stop')
    // tray state → 'processing' is set inside 'transcribe' handler
  })
}
