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
  parquet: boolean
}

export type StatsRequest =
  | { id: number; kind: 'refresh'; options: RefreshOptions }
  | { id: number; kind: 'selfTest' }
  | { id: number; kind: 'close' }

export type StatsReply =
  | { kind: 'reply'; id: number; ok: true; result: unknown }
  | { kind: 'reply'; id: number; ok: false; error: string }
  | { kind: 'step'; entry: StatsLogEntry }
  /** The database could not be opened; the worker exits after sending it. */
  | { kind: 'fatal'; error: string }
