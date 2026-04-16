import { createClient, type Client } from '@libsql/client'
import { app } from 'electron'
import { join } from 'path'

export interface TranscriptionRecord {
  id: number
  text: string
  raw_text: string
  model: string
  duration_ms: number
  advanced_parsing: number // 0 or 1 (SQLite boolean)
  created_at: string
  session_id: string
}

let db: Client

export async function initDatabase(): Promise<void> {
  const dbPath = join(app.getPath('userData'), 'history.db')
  db = createClient({ url: `file:${dbPath}` })

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      text          TEXT    NOT NULL,
      raw_text      TEXT    NOT NULL,
      model         TEXT    NOT NULL DEFAULT '',
      duration_ms   INTEGER NOT NULL DEFAULT 0,
      advanced_parsing INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id    TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_created_at ON transcriptions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session    ON transcriptions(session_id);
  `)
}

export async function saveTranscription(
  record: Omit<TranscriptionRecord, 'id' | 'created_at'>
): Promise<TranscriptionRecord> {
  const result = await db.execute({
    sql: `INSERT INTO transcriptions (text, raw_text, model, duration_ms, advanced_parsing, session_id)
          VALUES (:text, :raw_text, :model, :duration_ms, :advanced_parsing, :session_id)`,
    args: record as Record<string, string | number>
  })
  return (await getTranscriptionById(Number(result.lastInsertRowid)))!
}

export async function getTranscriptions(
  limit = 100,
  offset = 0
): Promise<TranscriptionRecord[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT ? OFFSET ?',
    args: [limit, offset]
  })
  return result.rows as unknown as TranscriptionRecord[]
}

export async function getTranscriptionById(
  id: number
): Promise<TranscriptionRecord | undefined> {
  const result = await db.execute({
    sql: 'SELECT * FROM transcriptions WHERE id = ?',
    args: [id]
  })
  return result.rows[0] as unknown as TranscriptionRecord | undefined
}

export async function deleteTranscription(id: number): Promise<void> {
  await db.execute({ sql: 'DELETE FROM transcriptions WHERE id = ?', args: [id] })
}

export async function clearHistory(): Promise<void> {
  await db.execute('DELETE FROM transcriptions')
}

export async function searchTranscriptions(query: string): Promise<TranscriptionRecord[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM transcriptions WHERE text LIKE ? ORDER BY created_at DESC LIMIT 50',
    args: [`%${query}%`]
  })
  return result.rows as unknown as TranscriptionRecord[]
}
