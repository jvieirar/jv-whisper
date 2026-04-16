import { useState, useEffect, useRef, useCallback } from 'react'
import History from './components/History'
import Settings from './components/Settings'
import Setup from './components/Setup'
import RecordingIndicator from './components/RecordingIndicator'
import type { TranscriptionRecord } from '../../preload/index'

type Tab = 'history' | 'settings'
type AppState = 'idle' | 'recording' | 'processing'
type Screen = 'loading' | 'setup' | 'app'

export default function App() {
  const [tab, setTab] = useState<Tab>('history')
  const [appState, setAppState] = useState<AppState>('idle')
  const [newRecord, setNewRecord] = useState<TranscriptionRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessibilityWarning, setAccessibilityWarning] = useState(false)
  const [pasteWarning, setPasteWarning] = useState<string | null>(null)
  const [parsingWarning, setParsingWarning] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(100)
      setAppState('recording')
      playBeep(880, 80)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied'
      setError(msg)
      setAppState('idle')
    }
  }, [])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    const stream = streamRef.current
    if (!recorder || recorder.state === 'inactive') return

    playBeep(440, 80)
    setAppState('processing')

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    stream?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const arrayBuffer = await blob.arrayBuffer()

    const result = await window.api.transcribe(arrayBuffer)
    if (!result.ok) {
      setError(result.error ?? 'Transcription failed')
      setAppState('idle')
    }
  }, [])

  // Apply initial dark/light mode class before first render
  useEffect(() => {
    window.api.getNativeTheme().then((isDark) => {
      document.body.classList.toggle('dark', isDark)
    })
  }, [])

  // Check setup status on launch
  useEffect(() => {
    window.api.setupStatus().then((status) => {
      setScreen(status.packagesInstalled ? 'app' : 'setup')
    })
  }, [])

  // Wire up main-process events (always registered, regardless of screen)
  useEffect(() => {
    const offStart = window.api.onRecordStart(startRecording)
    const offStop = window.api.onRecordStop(stopRecording)
    const offProcEnd = window.api.onProcessingEnd(() => setAppState('idle'))

    const offComplete = window.api.onTranscriptionComplete((record) => {
      setNewRecord(record)
      setAppState('idle')
      setTab('history')
    })

    const offError = window.api.onTranscriptionError((msg) => {
      setError(msg)
      setAppState('idle')
    })

    const offAccess = window.api.onAccessibilityError(() => {
      setAccessibilityWarning(true)
    })

    const offPaste = window.api.onPasteFailed((msg) => {
      setPasteWarning(msg)
    })

    const offParsingFailed = window.api.onAdvancedParsingFailed((msg) => {
      setParsingWarning(`Advanced parsing failed — showing raw transcript. ${msg}`)
    })

    const offTheme = window.api.onThemeChanged(({ isDark }) => {
      document.body.classList.toggle('dark', isDark)
    })

    return () => {
      offStart()
      offStop()
      offProcEnd()
      offComplete()
      offError()
      offAccess()
      offPaste()
      offParsingFailed()
      offTheme()
    }
  }, [startRecording, stopRecording])

  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-surface-900 text-gray-600 text-sm">
        Starting…
      </div>
    )
  }

  if (screen === 'setup') {
    return (
      <Setup
        onComplete={() => setScreen('app')}
        onSkip={() => setScreen('app')}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-surface-900 text-gray-100 select-none overflow-hidden">
      {/* Traffic light spacing + title bar */}
      <div className="drag-region flex items-center gap-4 px-4 pt-10 pb-3 border-b border-white/5">
        <div className="no-drag flex gap-1 ml-auto">
          {(['history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {t === 'history' ? '🕐 History' : '⚙️ Settings'}
            </button>
          ))}
        </div>
        <div className="no-drag flex items-center gap-2 ml-3">
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded-full ${
              appState === 'recording'
                ? 'bg-red-500/20 text-red-400'
                : appState === 'processing'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-green-500/10 text-green-600'
            }`}
          >
            {appState === 'recording' ? '● REC' : appState === 'processing' ? '⏳ …' : '● ready'}
          </span>
        </div>
      </div>

      {/* Accessibility permission warning */}
      {accessibilityWarning && (
        <div className="mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm flex justify-between items-start gap-3">
          <span>
            <strong>⌨️ Hotkeys disabled</strong> — grant Accessibility permission to enable them.<br />
            <span className="text-amber-400/70 text-xs">
              System Settings → Privacy &amp; Security → Accessibility → enable jv-whisper (or Terminal)
            </span>
            <br />
            <button
              onClick={() => window.api.openAccessibilitySettings()}
              className="mt-1.5 text-xs px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors"
            >
              Open Accessibility Settings
            </button>
          </span>
          <button
            onClick={() => setAccessibilityWarning(false)}
            className="text-amber-500 hover:text-amber-300 shrink-0"
          >✕</button>
        </div>
      )}

      {/* Paste failure warning */}
      {pasteWarning && (
        <div className="mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm flex justify-between items-start">
          <span>⚠️ Paste failed: {pasteWarning}</span>
          <button onClick={() => setPasteWarning(null)} className="ml-3 text-amber-500 hover:text-amber-300">✕</button>
        </div>
      )}

      {/* Advanced parsing warning banner */}
      {parsingWarning && (
        <div className="mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm flex justify-between items-start gap-3">
          <span>⚠️ {parsingWarning}</span>
          <button onClick={() => setParsingWarning(null)} className="text-amber-500 hover:text-amber-300 shrink-0">✕</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex justify-between items-start">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-red-500 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'history' ? (
          <History newRecord={newRecord} />
        ) : (
          <Settings onOpenSetup={() => setScreen('setup')} />
        )}
      </div>

      {/* Recording overlay */}
      <RecordingIndicator state={appState} />
    </div>
  )
}

function playBeep(frequency: number, duration: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration / 1000)
  } catch {
    // Audio not available
  }
}
