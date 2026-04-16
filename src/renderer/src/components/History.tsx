import { useState, useEffect, useRef } from 'react'
import type { TranscriptionRecord } from '../../../preload/index'

interface Props {
  newRecord: TranscriptionRecord | null
}

export default function History({ newRecord }: Props) {
  const [records, setRecords] = useState<TranscriptionRecord[]>([])
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  // When a new transcription arrives, prepend it
  useEffect(() => {
    if (!newRecord) return
    setRecords((prev) => {
      const exists = prev.some((r) => r.id === newRecord.id)
      if (exists) return prev
      return [newRecord, ...prev]
    })
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [newRecord])

  async function loadHistory() {
    setLoading(true)
    const data = await window.api.getHistory(100)
    setRecords(data)
    setLoading(false)
  }

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.trim() === '') {
      loadHistory()
    } else {
      const data = await window.api.searchHistory(q)
      setRecords(data)
    }
  }

  async function handleCopy(record: TranscriptionRecord) {
    await window.api.copyText(record.text)
    setCopiedId(record.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function handleDelete(id: number) {
    await window.api.deleteTranscription(id)
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleClear() {
    if (!confirm('Clear all history? This cannot be undone.')) return
    await window.api.clearHistory()
    setRecords([])
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso + 'Z')
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return d.toLocaleDateString()
  }

  // Group by session
  const grouped = records.reduce<Record<string, TranscriptionRecord[]>>((acc, r) => {
    const key = r.session_id || 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      {/* Search + clear */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search history…"
            className="w-full bg-surface-700 border border-white/8 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
        {records.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        <div ref={topRef} />

        {loading && (
          <div className="text-center text-gray-600 py-12 text-sm">Loading…</div>
        )}

        {!loading && records.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎙️</div>
            <p className="text-gray-500 text-sm">
              {query ? 'No results found.' : 'No transcriptions yet.'}
            </p>
            <p className="text-gray-700 text-xs mt-1">
              Hold your hotkey and start speaking.
            </p>
          </div>
        )}

        {!loading &&
          Object.entries(grouped).map(([sessionId, sessionRecords], groupIdx) => (
            <div key={sessionId}>
              {groupIdx > 0 && (
                <div className="flex items-center gap-2 my-4">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-gray-700 uppercase tracking-wider">
                    Previous session
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}
              {sessionRecords.map((record) => (
                <div
                  key={record.id}
                  className="group glass rounded-xl p-4 mb-2 hover:bg-white/[0.06] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 leading-relaxed break-words">
                        {record.text}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[11px] text-gray-600">
                          {formatTime(record.created_at)}
                        </span>
                        {record.duration_ms > 0 && (
                          <span className="text-[11px] text-gray-700">
                            {(record.duration_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                        {record.advanced_parsing === 1 && (
                          <span className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">
                            AI enhanced
                          </span>
                        )}
                        {record.text !== record.raw_text && (
                          <span
                            title={`Raw: ${record.raw_text}`}
                            className="text-[10px] text-gray-700 cursor-help underline decoration-dotted"
                          >
                            edited
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleCopy(record)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                      >
                        {copiedId === record.id ? '✓' : 'Copy'}
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
