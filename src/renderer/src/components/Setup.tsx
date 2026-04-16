import { useState, useEffect, useRef } from 'react'

type StepState = 'pending' | 'running' | 'done' | 'error'

interface Step {
  id: string
  label: string
  description: string
  state: StepState
}

interface LogEntry {
  msg: string
  type?: 'info' | 'success' | 'error'
}

interface Props {
  onComplete: () => void
  onSkip: () => void
}

const INITIAL_STEPS: Step[] = [
  {
    id: 'python',
    label: 'Find Python',
    description: 'Locate a Python 3.9+ installation on your system',
    state: 'pending'
  },
  {
    id: 'env',
    label: 'Set up environment',
    description: 'Create an isolated Python environment and install mlx-whisper',
    state: 'pending'
  },
  {
    id: 'model',
    label: 'Download Whisper model',
    description: 'Download the transcription model (~800 MB, cached forever after)',
    state: 'pending'
  }
]

export default function Setup({ onComplete, onSkip }: Props) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [pythonPath, setPythonPath] = useState('')
  const [customPython, setCustomPython] = useState('')
  const [model, setModel] = useState('mlx-community/whisper-large-v3-turbo')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [skipModel, setSkipModel] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-detect Python on mount
    checkPython()

    // Listen for log stream from main
    const off = window.api.onSetupLog((entry) => {
      setLogs((prev) => [...prev, entry])
    })
    return off
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  async function checkPython() {
    setStepState('python', 'running')
    const found = await window.api.setupFindPython()
    if (found) {
      setPythonPath(found)
      setCustomPython(found)
      setStepState('python', 'done')
      appendLog(`✓ Found Python at ${found}`, 'success')
    } else {
      setStepState('python', 'error')
      appendLog('Python not found. Enter the path manually below.', 'error')
    }
  }

  function setStepState(id: string, state: StepState) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state } : s)))
  }

  function appendLog(msg: string, type?: 'info' | 'success' | 'error') {
    setLogs((prev) => [...prev, { msg, type }])
  }

  async function runSetup() {
    const python = customPython || pythonPath
    if (!python) {
      appendLog('No Python path provided.', 'error')
      return
    }

    setRunning(true)
    setLogs([])

    // Step: environment
    setStepState('env', 'running')
    const envResult = await window.api.setupInstall(python)
    if (!envResult.ok) {
      setStepState('env', 'error')
      setRunning(false)
      return
    }
    setStepState('env', 'done')

    if (!skipModel) {
      // Step: model
      setStepState('model', 'running')
      const modelResult = await window.api.setupDownloadModel(model)
      if (!modelResult.ok) {
        setStepState('model', 'error')
        setRunning(false)
        return
      }
      setStepState('model', 'done')
    } else {
      setStepState('model', 'done')
      appendLog('⚠️  Model skipped — first transcription will download it automatically.', 'info')
    }

    setAllDone(true)
    setRunning(false)
  }

  const envStep = steps.find((s) => s.id === 'env')!
  const pythonStep = steps.find((s) => s.id === 'python')!
  const pythonReady = pythonStep.state === 'done' || !!customPython

  return (
    <div className="flex flex-col h-full bg-surface-900 text-gray-100">
      {/* Header */}
      <div className="drag-region px-8 pt-10 pb-6 border-b border-white/5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Set up jv-whisper</h1>
            <p className="text-sm text-gray-500 mt-1">
              One-time setup — everything runs locally after this.
            </p>
          </div>
          <button
            onClick={onSkip}
            className="no-drag text-xs text-gray-600 hover:text-gray-400 transition-colors mt-1"
          >
            Skip for now →
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: steps */}
        <div className="w-72 shrink-0 px-6 py-6 border-r border-white/5 space-y-2">
          {steps.map((step, i) => (
            <StepRow key={step.id} step={step} index={i + 1} />
          ))}

          {/* Python path input */}
          {(pythonStep.state === 'error' || pythonStep.state === 'done') && (
            <div className="mt-4 space-y-2">
              <label className="text-xs text-gray-500 block">Python 3 path</label>
              <input
                type="text"
                value={customPython}
                onChange={(e) => setCustomPython(e.target.value)}
                placeholder="/opt/homebrew/bin/python3"
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-white/25"
              />
              <p className="text-[10px] text-gray-700">
                Run <code className="text-gray-600">which python3</code> in Terminal to find yours.
              </p>
            </div>
          )}

          {/* Model selector */}
          <div className="mt-4 space-y-2">
            <label className="text-xs text-gray-500 block">Whisper model</label>
            <div className="space-y-1">
              {[
                { id: 'mlx-community/whisper-tiny-mlx', label: 'Tiny', size: '39 MB', note: 'fast, lower quality' },
                { id: 'mlx-community/whisper-base-mlx', label: 'Base', size: '74 MB', note: 'balanced' },
                {
                  id: 'mlx-community/whisper-large-v3-turbo',
                  label: 'Large v3 Turbo',
                  size: '809 MB',
                  note: '★ recommended'
                }
              ].map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    model === m.id ? 'bg-white/8 text-white' : 'hover:bg-white/5 text-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={model === m.id}
                    onChange={() => setModel(m.id)}
                    className="accent-indigo-500"
                  />
                  <span className="text-xs">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-gray-600 ml-1">{m.size}</span>
                    <br />
                    <span className="text-[10px] text-gray-700">{m.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={skipModel}
                onChange={(e) => setSkipModel(e.target.checked)}
                className="accent-indigo-500"
              />
              Skip download (auto-downloads on first use)
            </label>
          </div>
        </div>

        {/* Right: log + action */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Log output */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5 bg-surface-900">
            {logs.length === 0 ? (
              <div className="text-gray-700 mt-4 text-center text-sm font-sans">
                Output will appear here when setup runs.
              </div>
            ) : (
              logs.map((entry, i) => (
                <div
                  key={i}
                  className={`${
                    entry.type === 'success'
                      ? 'text-green-400'
                      : entry.type === 'error'
                        ? 'text-red-400'
                        : 'text-gray-400'
                  } whitespace-pre-wrap break-words`}
                >
                  {entry.msg}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Action buttons */}
          <div className="p-4 border-t border-white/5 flex items-center gap-3">
            {allDone ? (
              <button
                onClick={onComplete}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
              >
                🎙️ Open jv-whisper
              </button>
            ) : (
              <>
                <button
                  onClick={runSetup}
                  disabled={running || !pythonReady}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {running ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      Setting up…
                    </>
                  ) : envStep.state === 'error' ? (
                    '↺ Retry setup'
                  ) : (
                    '▶ Run setup'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const icons: Record<StepState, string> = {
    pending: `${index}`,
    running: '…',
    done: '✓',
    error: '✕'
  }
  const colors: Record<StepState, string> = {
    pending: 'bg-surface-600 text-gray-500',
    running: 'bg-amber-500/20 text-amber-400 animate-pulse',
    done: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400'
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl ${step.state !== 'pending' ? 'bg-white/3' : ''}`}>
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colors[step.state]}`}
      >
        {icons[step.state]}
      </span>
      <div>
        <p className={`text-sm font-medium ${step.state === 'done' ? 'text-white' : 'text-gray-400'}`}>
          {step.label}
        </p>
        <p className="text-[11px] text-gray-700 mt-0.5 leading-relaxed">{step.description}</p>
      </div>
    </div>
  )
}
