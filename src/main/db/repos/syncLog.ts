import type { SyncLogEntry, SyncStatusKind } from '@shared/types'
import type { Db } from '../connection'

interface Row {
  id: number
  source: string
  started_at: string
  finished_at: string | null
  status: SyncLogEntry['status']
  message: string | null
  rows_written: number
}

function toEntry(r: Row): SyncLogEntry {
  return {
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    message: r.message,
    rowsWritten: r.rows_written
  }
}

export function startSync(db: Db, source: string, startedAt: string): number {
  const result = db
    .prepare("INSERT INTO sync_log (source, started_at, status) VALUES (?, ?, 'running')")
    .run(source, startedAt)
  return Number(result.lastInsertRowid)
}

export function finishSync(
  db: Db,
  id: number,
  status: SyncStatusKind,
  finishedAt: string,
  message: string | null,
  rowsWritten: number
): SyncLogEntry {
  db.prepare(
    'UPDATE sync_log SET status = ?, finished_at = ?, message = ?, rows_written = ? WHERE id = ?'
  ).run(status, finishedAt, message, rowsWritten, id)
  const row = db.prepare('SELECT * FROM sync_log WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new Error(`sync_log ${id} not found`)
  return toEntry(row)
}

export function getLastSync(db: Db, source: string, status?: SyncStatusKind): SyncLogEntry | null {
  const row = (
    status
      ? db
          .prepare(
            'SELECT * FROM sync_log WHERE source = ? AND status = ? ORDER BY id DESC LIMIT 1'
          )
          .get(source, status)
      : db.prepare('SELECT * FROM sync_log WHERE source = ? ORDER BY id DESC LIMIT 1').get(source)
  ) as Row | undefined
  return row ? toEntry(row) : null
}

export function getLastError(db: Db): SyncLogEntry | null {
  const row = db
    .prepare("SELECT * FROM sync_log WHERE status = 'error' ORDER BY id DESC LIMIT 1")
    .get() as Row | undefined
  return row ? toEntry(row) : null
}

/** Latest entry whose source starts with `prefix` (e.g. every `nflverse:stats:<season>`). */
export function getLastSyncLike(
  db: Db,
  prefix: string,
  status: SyncStatusKind
): SyncLogEntry | null {
  const row = db
    .prepare('SELECT * FROM sync_log WHERE source LIKE ? AND status = ? ORDER BY id DESC LIMIT 1')
    .get(`${prefix}%`, status) as Row | undefined
  return row ? toEntry(row) : null
}

/**
 * Deletes rows started before `before`, except the newest row of each (source, status) pair so
 * freshness checks and the status bar keep working. Returns the number of rows removed.
 */
export function pruneSyncLog(db: Db, before: string): number {
  return Number(
    db
      .prepare(
        `DELETE FROM sync_log WHERE started_at < ?
         AND id NOT IN (SELECT MAX(id) FROM sync_log GROUP BY source, status)`
      )
      .run(before).changes
  )
}
