import { getSetting } from './store'

const OLLAMA_BASE = 'http://localhost:11434'

export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(2000)
    })
    return res.ok
  } catch {
    return false
  }
}

export async function getOllamaModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    })
    if (!res.ok) return []
    const data = (await res.json()) as { models: OllamaModel[] }
    return data.models ?? []
  } catch {
    return []
  }
}

export async function runAdvancedParsing(rawText: string): Promise<string> {
  const model = getSetting('advancedParsingModel')
  if (!model) throw new Error('No advanced parsing model configured. Go to Settings → Advanced Parsing.')

  const prompt = `You are a precise transcription cleaner. Given raw speech-to-text output, return only the cleaned version.

Rules:
- Fix punctuation, capitalization, and grammar
- Remove filler words (um, uh, like, you know, so, basically, literally)
- Keep the meaning and tone completely intact
- Do NOT add new content or summarize — just clean
- Return ONLY the cleaned text, no explanations or metadata

Raw transcription:
"${rawText}"`

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`)

  const data = (await res.json()) as { response: string }
  return data.response.trim()
}
