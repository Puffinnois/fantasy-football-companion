import { relativeTime } from '@/lib/format'
import { SYNC_SOURCE_GROUPS, syncGroupOf } from '@shared/syncSources'
import type { SyncLogEntry, SyncStatus } from '@shared/types'

export type SourceState = 'ok' | 'running' | 'queued' | 'error' | 'unknown'

export interface SourceRow {
  key: string
  label: string
  what: string
  state: SourceState
  /** "3 min ago" for ok rows. */
  when: string
  rows: string
  message: string
}

/** "1,234 rows" or ''. */
const rowsText = (n: number): string => (n > 0 ? `${n.toLocaleString('en-US')} rows` : '')

/**
 * Setup "Data sources": during a run, a group that reported is ok / failed, the first one still
 * silent is syncing and the rest are queued; outside a run each group shows its last finished entry.
 */
export function sourceRows(
  status: SyncStatus | null,
  runEvents: SyncLogEntry[] | null,
  now: number = Date.now()
): SourceRow[] {
  let syncingShown = false
  return SYNC_SOURCE_GROUPS.map((g) => {
    const base = { key: g.key, label: g.label, what: g.what }
    if (runEvents !== null) {
      const mine = runEvents.filter((e) => syncGroupOf(e.source) === g.key)
      if (mine.length === 0) {
        const state: SourceState = syncingShown ? 'queued' : 'running'
        syncingShown = true
        return { ...base, state, when: '', rows: '', message: '' }
      }
      const failed = mine.find((e) => e.status === 'error')
      const last = mine[mine.length - 1]
      return {
        ...base,
        state: failed ? 'error' : 'ok',
        when: relativeTime(last.finishedAt, now),
        rows: rowsText(mine.reduce((n, e) => n + e.rowsWritten, 0)),
        message: failed ? `${failed.source}: ${failed.message ?? 'failed'}` : ''
      }
    }
    const e = status?.sources?.[g.key] ?? null
    if (!e) return { ...base, state: 'unknown', when: '', rows: '', message: '' }
    return {
      ...base,
      state: e.status === 'error' ? 'error' : 'ok',
      when: relativeTime(e.finishedAt, now),
      rows: rowsText(e.rowsWritten),
      message: e.status === 'error' ? (e.message ?? 'failed') : ''
    }
  })
}

/** Two-letter monogram of a league name, ignoring emoji and punctuation. */
export function leagueMonogram(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[A-Za-z0-9]/.test(w))
      .slice(0, 2)
      .map((w) => (w.match(/[A-Za-z0-9]/)?.[0] ?? '').toUpperCase())
      .join('') || '?'
  )
}
