import { useState, useEffect, useCallback, useRef } from 'react'
import type { Settings } from '../../../preload/index'

// ── Hotkey recorder widget ─────────────────────────────────────────────────
type RecorderState = 'idle' | 'recording' | 'confirming'

function HotkeyRecorder({
  value,
  onChange
}: {
  value: string
  onChange: (combo: string) => void
}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [liveCombo, setLiveCombo] = useState('')
  const [flash, setFlash] = useState(false)
  const unsubRef = useRef<(() => void)[]>([])

  const stopCapture = useCallback((cancel = false) => {
    window.api.stopHotkeyCapture()
    unsubRef.current.forEach((fn) => fn())
    unsubRef.current = []
    setState('idle')
    setLiveCombo('')
    if (cancel) return
  }, [])

  const startCapture = useCallback(() => {
    setState('recording')
    setLiveCombo('')
    window.api.startHotkeyCapture()

    const u1 = window.api.onHotkeyCaptureUpdate((combo) => {
      setLiveCombo(combo)
      setState('recording')
    })
    const u2 = window.api.onHotkeyCaptured((combo) => {
      unsubRef.current.forEach((fn) => fn())
      unsubRef.current = []
      setState('confirming')
      setLiveCombo(combo)
      onChange(combo)
      setFlash(true)
      setTimeout(() => {
        setFlash(false)
        setState('idle')
        setLiveCombo('')
      }, 800)
    })
    unsubRef.current = [u1, u2]
  }, [onChange])

  // Clean up on unmount
  useEffect(() => () => stopCapture(true), [stopCapture])

  if (state === 'idle') {
    return (
      <button
        onClick={startCapture}
        className="flex items-center gap-2 bg-surface-700 border border-white/10 hover:border-white/25 rounded-lg px-3 py-1.5 text-sm text-gray-200 w-44 justify-center transition-colors group"
      >
        <span className="font-mono">{value || '—'}</span>
        <span className="text-gray-600 group-hover:text-gray-400 text-xs">✎</span>
      </button>
    )
  }

  if (state === 'confirming') {
    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 w-44 justify-center border transition-all ${flash ? 'bg-green-500/15 border-green-500/40' : 'bg-surface-700 border-white/10'}`}>
        <span className="text-green-400 text-xs font-mono">{liveCombo}</span>
        {flash && <span className="text-green-400 text-xs">✓</span>}
      </div>
    )
  }

  // recording
  return (
    <div className="flex flex-col items-end gap-1 w-44">
      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-1.5 w-full justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span className="font-mono text-sm text-amber-300">
          {liveCombo || 'Press keys…'}
        </span>
      </div>
      <div className="flex items-center justify-between w-full px-0.5">
        <span className="text-[10px] text-gray-600">Release all keys to confirm</span>
        <button
          onClick={() => stopCapture(true)}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          cancel
        </button>
      </div>
    </div>
  )
}

const PRESET_MODELS = [
  'mlx-community/whisper-tiny-mlx',
  'mlx-community/whisper-base-mlx',
  'mlx-community/whisper-large-v3-turbo'
] as const

type CheckState = 'idle' | 'checking' | 'ok' | 'error'

interface StatusBadgeProps {
  state: CheckState
  label?: string
}

function StatusBadge({ state, label }: StatusBadgeProps) {
  const map: Record<CheckState, { cls: string; icon: string }> = {
    idle: { cls: 'bg-white/5 text-gray-600', icon: '●' },
    checking: { cls: 'bg-amber-500/15 text-amber-400', icon: '…' },
    ok: { cls: 'bg-green-500/15 text-green-400', icon: '✓' },
    error: { cls: 'bg-red-500/15 text-red-400', icon: '✕' }
  }
  const { cls, icon } = map[state]
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {icon} {label ?? state}
    </span>
  )
}

interface Props {
  onOpenSetup: () => void
}

export default function Settings({ onOpenSetup }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [whisperStatus, setWhisperStatus] = useState<CheckState>('idle')
  const [whisperVersion, setWhisperVersion] = useState('')
  const [ollamaStatus, setOllamaStatus] = useState<CheckState>('idle')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [modelStatuses, setModelStatuses] = useState<Record<string, boolean | undefined>>({})
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

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

  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
      await window.api.setSetting(key, value)
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    },
    []
  )

  const handleDownloadModel = async (model: string) => {
    if (downloadingModel !== null) return  // already downloading
    setDownloadError(null)
    setDownloadingModel(model)
    const result = await window.api.downloadModel(model)
    if (result.ok) {
      setModelStatuses((prev) => ({ ...prev, [model]: true }))
      updateSetting('whisperModel', model)
    } else {
      setDownloadError(result.error ?? 'Download failed')
    }
    setDownloadingModel(null)
  }

  const checkWhisper = async () => {
    setWhisperStatus('checking')
    const result = await window.api.checkWhisper()
    if (result.available) {
      setWhisperStatus('ok')
      setWhisperVersion(result.version ?? 'installed')
    } else {
      setWhisperStatus('error')
      setWhisperVersion(result.error ?? 'not found')
    }
  }

  const checkOllama = async () => {
    setOllamaStatus('checking')
    const running = await window.api.checkOllama()
    setOllamaStatus(running ? 'ok' : 'error')
    if (running) {
      const models = await window.api.getOllamaModels()
      setOllamaModels(models.map((m) => m.name))
    }
  }

  if (!settings) {
    return <div className="flex items-center justify-center h-full text-gray-600 text-sm">Loading…</div>
  }

  return (
    <div className="overflow-y-auto h-full px-6 py-4 space-y-6">
      {/* Auto-save indicator */}
      <div className="flex justify-end">
        <span
          className={`text-[11px] text-green-500 transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}
        >
          ✓ Saved
        </span>
      </div>

      {/* ── Recording ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Recording
        </h2>
        <div className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-gray-200">Hotkey</label>
              <p className="text-xs text-gray-600 mt-0.5">
                Click to record a new key combination
              </p>
            </div>
            <HotkeyRecorder
              value={settings.hotkey}
              onChange={(combo) => updateSetting('hotkey', combo)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-gray-200">Mode</label>
              <p className="text-xs text-gray-600 mt-0.5">
                Hold: record while key is held. Toggle: press once to start, again to stop.
              </p>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['hold', 'toggle'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => updateSetting('hotkeySwitchMode', m)}
                  className={`px-3 py-1.5 text-sm transition-all ${
                    settings.hotkeySwitchMode === m
                      ? 'bg-white/15 text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-200">Sound feedback</label>
            <Toggle
              value={settings.soundEnabled}
              onChange={(v) => updateSetting('soundEnabled', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-gray-200">Keep in clipboard after pasting</label>
              <p className="text-xs text-gray-500 mt-0.5">Text is always pasted into the focused field. Enable to also keep it in clipboard.</p>
            </div>
            <Toggle
              value={settings.autoCopyToClipboard}
              onChange={(v) => updateSetting('autoCopyToClipboard', v)}
            />
          </div>
        </div>
      </section>

      {/* ── Whisper Model ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Transcription (Whisper)
        </h2>
        <div className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label className="text-sm text-gray-200">Model</label>
              <p className="text-xs text-gray-600 mt-0.5">
                HuggingFace repo ID. Downloaded on first use.
              </p>
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
              <div className="mt-1 flex gap-2 flex-wrap">
                {PRESET_MODELS.map((m) => {
                  const statusKnown = m in modelStatuses
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
                      {!statusKnown ? (
                        <span className="text-[10px] text-gray-600">…</span>
                      ) : isDownloaded ? (
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
              {downloadError && (
                <p className="text-xs text-red-400 mt-1">⚠️ {downloadError}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm text-gray-200">Python path</label>
              <p className="text-xs text-gray-600 mt-0.5">
                Path to your Python executable with mlx-whisper installed.
              </p>
              <input
                type="text"
                value={settings.whisperPythonPath}
                onChange={(e) => updateSetting('whisperPythonPath', e.target.value)}
                className="mt-2 w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-white/25 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge
                state={whisperStatus}
                label={
                  whisperStatus === 'ok'
                    ? `mlx-whisper ${whisperVersion}`
                    : whisperStatus === 'error'
                      ? whisperVersion || 'not found'
                      : whisperStatus === 'checking'
                        ? 'checking…'
                        : 'not checked'
                }
              />
            </div>
            <button
              onClick={checkWhisper}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              Check
            </button>
          </div>
        </div>
      </section>

      {/* ── Advanced Parsing ────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Advanced Parsing (Ollama)
        </h2>
        <div className="glass rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-gray-200">Enable AI cleanup</label>
              <p className="text-xs text-gray-600 mt-0.5">
                Post-process transcriptions with a local LLM via Ollama.
                Fixes grammar, removes filler words, improves readability.
              </p>
            </div>
            <Toggle
              value={settings.advancedParsingEnabled}
              onChange={(v) => updateSetting('advancedParsingEnabled', v)}
            />
          </div>

          {settings.advancedParsingEnabled && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    state={ollamaStatus}
                    label={ollamaStatus === 'ok' ? 'Ollama running' : ollamaStatus === 'error' ? 'Not running' : ollamaStatus === 'checking' ? 'checking…' : 'Ollama'}
                  />
                </div>
                <button
                  onClick={checkOllama}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  Check
                </button>
              </div>

              <div>
                <label className="text-sm text-gray-200">Model</label>
                <p className="text-xs text-gray-600 mt-0.5">
                  Select a model pulled in Ollama. Click "Check" above to refresh the list.
                </p>
                {ollamaModels.length > 0 ? (
                  <select
                    value={settings.advancedParsingModel}
                    onChange={(e) => updateSetting('advancedParsingModel', e.target.value)}
                    className="mt-2 w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-white/25"
                  >
                    <option value="">— select a model —</option>
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.advancedParsingModel}
                    onChange={(e) => updateSetting('advancedParsingModel', e.target.value)}
                    placeholder="e.g. gemma4:e4b"
                    className="mt-2 w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-white/25 font-mono"
                  />
                )}
              </div>

              <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg p-3 text-xs text-amber-500/80">
                ⚡ Advanced parsing adds ~2–5s per transcription depending on model size.
                Make sure Ollama is running: <code>ollama serve</code>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── API Tokens ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          API Tokens
        </h2>
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <label className="text-sm text-gray-200">HuggingFace Token</label>
            <p className="text-xs text-gray-600 mt-0.5">
              Optional. Enables higher rate limits when downloading models.{' '}
              <span className="text-gray-500">Get one free at huggingface.co/settings/tokens</span>
            </p>
            <input
              type="password"
              value={settings.hfToken}
              onChange={(e) => updateSetting('hfToken', e.target.value)}
              placeholder="hf_xxxxxxxxxxxxxxxx"
              className="mt-2 w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-white/25 font-mono"
            />
          </div>
        </div>
      </section>

      {/* ── Setup / Repair ──────────────────────────────────────────── */}
      <section className="pb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Installation
        </h2>
        <div className="glass rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-200">Re-run setup wizard</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Reinstall the Python environment or re-download the Whisper model.
            </p>
          </div>
          <button
            onClick={onOpenSetup}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all shrink-0"
          >
            Open setup →
          </button>
        </div>
      </section>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        value ? 'bg-indigo-500' : 'bg-surface-600 border border-white/10'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
