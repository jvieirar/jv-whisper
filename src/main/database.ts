import Database from 'better-sqlite3'
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

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'history.db')
  db = new Database(dbPath)

  db.exec(`
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

export function saveTranscription(
  record: Omit<TranscriptionRecord, 'id' | 'created_at'>
): TranscriptionRecord {
  const stmt = db.prepare(`
    INSERT INTO transcriptions (text, raw_text, model, duration_ms, advanced_parsing, session_id)
    VALUES (@text, @raw_text, @model, @duration_ms, @advanced_parsing, @session_id)
  `)
  const result = stmt.run(record)
  return getTranscriptionById(result.lastInsertRowid as number)!
}

export function getTranscriptions(limit = 100, offset = 0): TranscriptionRecord[] {
  return db
    .prepare('SELECT * FROM transcriptions ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as TranscriptionRecord[]
}

export function getTranscriptionById(id: number): TranscriptionRecord | undefined {
  return db
    .prepare('SELECT * FROM transcriptions WHERE id = ?')
    .get(id) as TranscriptionRecord | undefined
}

export function deleteTranscription(id: number): void {
  db.prepare('DELETE FROM transcriptions WHERE id = ?').run(id)
}

export function clearHistory(): void {
  db.exec('DELETE FROM transcriptions')
}

export function searchTranscriptions(query: string): TranscriptionRecord[] {
  return db
    .prepare("SELECT * FROM transcriptions WHERE text LIKE ? ORDER BY created_at DESC LIMIT 50")
    .all(`%${query}%`) as TranscriptionRecord[]
}
