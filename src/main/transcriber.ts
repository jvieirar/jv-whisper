import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { getSetting } from './store'
import { AUGMENTED_PATH } from './utils'

export interface TranscriptionResult {
  text: string
  language?: string
  duration_ms: number
}

export async function transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const pythonPath = getSetting('whisperPythonPath')
    const model = getSetting('whisperModel')
    const hfToken = getSetting('hfToken')

    // In packaged app, scripts live in extraResources; in dev, relative to project root
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, 'scripts', 'transcribe.py')
      : join(app.getAppPath(), 'scripts', 'transcribe.py')

    const start = Date.now()
    // Packaged app gets minimal PATH — add Homebrew/common paths so Python can find ffmpeg
    const env = {
      ...process.env,
      PATH: AUGMENTED_PATH,
      ...(hfToken ? { HF_TOKEN: hfToken } : {})
    }
    const proc = spawn(pythonPath, [scriptPath, audioFilePath, model], { env })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))

    proc.on('close', (code) => {
      const duration_ms = Date.now() - start

      if (code !== 0) {
        reject(new Error(`Transcription failed (exit ${code}): ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) {
          reject(new Error(result.error))
          return
        }
        resolve({ ...result, duration_ms })
      } catch {
        reject(new Error(`Failed to parse transcription output: ${stdout}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}. Check 'whisperPythonPath' in Settings.`))
    })
  })
}

export async function checkWhisperAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const pythonPath = getSetting('whisperPythonPath')
    const proc = spawn(pythonPath, ['-c', 'import mlx_whisper; print(mlx_whisper.__version__ if hasattr(mlx_whisper, "__version__") else "ok")'])

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ available: true, version: stdout.trim() })
      } else {
        resolve({ available: false, error: stderr.trim() || 'mlx-whisper not installed' })
      }
    })

    proc.on('error', (err) => {
      resolve({ available: false, error: `Python not found at '${pythonPath}': ${err.message}` })
    })
  })
}
