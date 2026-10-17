import type { ScoringRules } from '@shared/stats/scoring'
import type { StatsQuery } from '@shared/stats/types'

export type StatsStepStatus = 'ok' | 'error' | 'skipped' | 'running' | 'interrupted'

/** One row of `stats.duckdb`'s own `sync_log`. */
export interface StatsLogEntry {
  id: number
  source: string
  startedAt: string
  finishedAt: string | null
  status: StatsStepStatus
  message: string | null
  rowsWritten: number
}

export interface StatsSyncResult {
  steps: StatsLogEntry[]
}

export interface RefreshOptions {
  /** Re-fetch the current season and all-seasons files even within a day of the last attempt. */
  force?: boolean
}

/** What the stats worker is started with. */
export interface StatsWorkerInit {
  /** `stats.duckdb` (stats-analysis spec §4). */
  path: string
  /** Downloads and DuckDB's spill files. */
  tempDir: string
}

export interface SelfTestResult {
  duckdb: string
  rows: number
  /** A Parquet round trip (every nflverse source). */
  parquet: boolean
  /** `read_json` (Sleeper's lines). */
  json: boolean
  /** ICU time zones (depth-chart kickoffs). */
  icu: boolean
  /** The query engine answers a query (spec §11: the packaged worker answers a query). */
  query: boolean
}

/**
 * Requests to the worker. `refresh`, `setLeague`, `selfTest` and `close` run one after another;
 * `query`, `catalogue` and `status` are reads and run at once on a second connection (spec §2).
 */
export type StatsRequest =
  | { id: number; kind: 'refresh'; options: RefreshOptions }
  | { id: number; kind: 'setLeague'; rules: ScoringRules | null }
  | { id: number; kind: 'selfTest' }
  | { id: number; kind: 'close' }
  | { id: number; kind: 'query'; query: StatsQuery }
  | { id: number; kind: 'catalogue' }
  | { id: number; kind: 'status' }

/** The kinds that run at once instead of in turn. */
export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
  'query',
  'catalogue',
  'status'
])

export type StatsReply =
  | { kind: 'reply'; id: number; ok: true; result: unknown }
  | { kind: 'reply'; id: number; ok: false; error: string }
  | { kind: 'step'; entry: StatsLogEntry }
  /** The database could not be opened; the worker exits after sending it. */
  | { kind: 'fatal'; error: string }
