import { spawn, execFileSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { AUGMENTED_PATH } from './utils'

// All managed files live in ~/Library/Application Support/jv-whisper/
export function getVenvDir(): string {
  return join(app.getPath('userData'), 'whisper-env')
}
export function getVenvPython(): string {
  return join(getVenvDir(), 'bin', 'python3')
}

/** Common Python paths on macOS (app launched without full shell PATH) */
const PYTHON_CANDIDATES = [
  '/opt/homebrew/bin/python3', // Homebrew Apple Silicon
  '/usr/local/bin/python3', // Homebrew Intel
  '/usr/bin/python3', // System (Xcode CLI tools)
  'python3',
  'python'
]

/** Env with augmented PATH so subprocesses can find ffmpeg, brew tools, etc. */
function makeEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, PATH: AUGMENTED_PATH, ...extra }
}

export interface SetupStatus {
  pythonFound: boolean
  pythonPath: string
  venvExists: boolean
  packagesInstalled: boolean
  venvPython: string
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const venvPython = getVenvPython()
  const venvExists = existsSync(venvPython)

  let packagesInstalled = false
  if (venvExists) {
    try {
      execFileSync(venvPython, ['-c', 'import mlx_whisper, soundfile'], { timeout: 5000 })
      packagesInstalled = true
    } catch {
      // not installed
    }
  }

  const pythonPath = findPythonSync()

  return {
    pythonFound: !!pythonPath,
    pythonPath: pythonPath ?? '',
    venvExists,
    packagesInstalled,
    venvPython
  }
}

export function findPythonSync(): string | null {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { timeout: 3000 })
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

export type LogCallback = (message: string, type?: 'info' | 'success' | 'error') => void

/** Creates venv + installs mlx-whisper, streaming logs via callback */
export function createVenvAndInstall(pythonPath: string, onLog: LogCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvDir = getVenvDir()
    mkdirSync(app.getPath('userData'), { recursive: true })

    onLog(`🐍 Creating Python environment at:\n   ${venvDir}`)

    const venvProc = spawn(pythonPath, ['-m', 'venv', venvDir, '--clear'])

    venvProc.stdout.on('data', (d) => onLog(d.toString().trim()))
    venvProc.stderr.on('data', (d) => {
      const line = d.toString().trim()
      if (line) onLog(line)
    })

    venvProc.on('error', (err) =>
      reject(new Error(`Could not launch Python: ${err.message}`))
    )

    venvProc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`venv creation failed (exit ${code})`))
        return
      }

      onLog('✓ Environment created', 'success')
      onLog('📦 Installing mlx-whisper and soundfile…')

      const pip = join(venvDir, 'bin', 'pip')
      const installProc = spawn(pip, [
        'install',
        '--upgrade',
        'mlx-whisper',
        'soundfile',
        'huggingface_hub'
      ])

      installProc.stdout.on('data', (d) => {
        const line = d.toString().trim()
        if (line) onLog(line)
      })
      installProc.stderr.on('data', (d) => {
        // pip sends progress/warnings to stderr
        const line = d.toString().trim()
        if (line) onLog(line)
      })

      installProc.on('error', (err) => reject(err))
      installProc.on('close', (installCode) => {
        if (installCode !== 0) {
          reject(new Error('pip install failed. Check the log above.'))
          return
        }
        onLog('✓ Packages installed', 'success')
        resolve()
      })
    })
  })
}

/** Streams model download progress via callback */
export function downloadModel(model: string, onLog: LogCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvPython = getVenvPython()
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, 'scripts', 'download_model.py')
      : join(app.getAppPath(), 'scripts', 'download_model.py')

    onLog(`⬇️  Downloading model: ${model}`)
    onLog('   (first download may take a few minutes — cached for next launch)')

    const proc = spawn(venvPython, [scriptPath, model], { env: makeEnv() })

    proc.stdout.on('data', (d) => {
      const line = d.toString().trim()
      if (line) onLog(line)
    })
    proc.stderr.on('data', (d) => {
      const line = d.toString().trim()
      if (line) onLog(line)
    })

    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) {
        onLog(`✓ Model ready`, 'success')
        resolve()
      } else {
        reject(new Error('Model download failed. Check the log above.'))
      }
    })
  })
}
