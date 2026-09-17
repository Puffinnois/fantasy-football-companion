import type { Db } from '@main/db/connection'
import { finishSync, getLastSync, startSync } from '@main/db/repos/syncLog'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncLogEntry } from '@shared/types'

export interface SyncDeps {
  db: Db
  sleeper: SleeperClient
  now?: () => Date
  onStep?: (entry: SyncLogEntry) => void
}

export interface RefreshOptions {
  force?: boolean
}

/** Thrown by a step body to record `skipped` (e.g. upstream file not published yet) instead of `error`. */
export class SkipStep extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkipStep'
  }
}

/** A step returns the rows it wrote, optionally with a message shown in the status bar / sync log. */
export type StepOutcome = number | { rows: number; message: string | null }

export function nowOf(deps: SyncDeps): Date {
  return (deps.now ?? (() => new Date()))()
}

export function isFresh(db: Db, source: string, freshnessMs: number, now: Date): boolean {
  const last = getLastSync(db, source, 'ok')
  if (!last?.finishedAt) return false
  return now.getTime() - new Date(last.finishedAt).getTime() < freshnessMs
}

/**
 * Runs one sync step under a `sync_log` row. `freshnessMs` of 0 means "always run".
 * The step body is responsible for its own transaction; a throw rolls that back and is
 * recorded here as `error` (or `skipped` for `SkipStep`). Never throws.
 */
export async function runStep(
  deps: SyncDeps,
  source: string,
  freshnessMs: number,
  force: boolean,
  fn: () => Promise<StepOutcome>
): Promise<SyncLogEntry> {
  const id = startSync(deps.db, source, nowOf(deps).toISOString())
  let entry: SyncLogEntry
  if (!force && isFresh(deps.db, source, freshnessMs, nowOf(deps))) {
    entry = finishSync(deps.db, id, 'skipped', nowOf(deps).toISOString(), 'fresh', 0)
  } else {
    try {
      const outcome = await fn()
      const rows = typeof outcome === 'number' ? outcome : outcome.rows
      const message = typeof outcome === 'number' ? null : outcome.message
      entry = finishSync(deps.db, id, 'ok', nowOf(deps).toISOString(), message, rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const status = err instanceof SkipStep ? 'skipped' : 'error'
      entry = finishSync(deps.db, id, status, nowOf(deps).toISOString(), message, 0)
    }
  }
  try {
    deps.onStep?.(entry)
  } catch {
    // progress reporting must never affect the sync itself
  }
  return entry
}
