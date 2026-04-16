import { useState, useEffect, useRef, useCallback } from 'react'
import History from './components/History'
import Settings from './components/Settings'
import RecordingIndicator from './components/RecordingIndicator'
import type { TranscriptionRecord } from '../../preload/index'

type Tab = 'history' | 'settings'
type AppState = 'idle' | 'recording' | 'processing'

export default function App() {
  const [tab, setTab] = useState<Tab>('history')
  const [appState, setAppState] = useState<AppState>('idle')
  const [newRecord, setNewRecord] = useState<TranscriptionRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
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

      recorder.start(100) // collect chunks every 100ms
      setAppState('recording')

      // Play start sound
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

    // Release mic
    stream?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const arrayBuffer = await blob.arrayBuffer()

    const result = await window.api.transcribe(arrayBuffer)
    if (!result.ok) {
      setError(result.error ?? 'Transcription failed')
      setAppState('idle')
    }
    // transcription-complete event will handle the rest
  }, [])

  // Listen for hotkey events from main process
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

    return () => {
      offStart()
      offStop()
      offProcEnd()
      offComplete()
      offError()
    }
  }, [startRecording, stopRecording])

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
          <Settings />
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
