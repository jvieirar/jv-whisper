type AppState = 'idle' | 'recording' | 'processing'

export default function RecordingIndicator({ state }: { state: AppState }) {
  if (state === 'idle') return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div
        className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all ${
          state === 'recording'
            ? 'bg-red-950/80 border-red-500/30 text-red-300'
            : 'bg-surface-800/90 border-white/10 text-amber-300'
        }`}
      >
        {state === 'recording' ? (
          <>
            {/* Animated rings */}
            <div className="relative flex items-center justify-center w-6 h-6">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </div>
            <span className="text-sm font-medium tracking-wide">Recording…</span>
            <span className="text-xs text-red-500/70">release key to stop</span>
          </>
        ) : (
          <>
            <span className="text-base animate-pulse">⏳</span>
            <span className="text-sm font-medium">Transcribing…</span>
          </>
        )}
      </div>
    </div>
  )
}
