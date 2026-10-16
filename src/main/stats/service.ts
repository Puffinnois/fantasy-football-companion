import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createSleeperClient } from '@main/sources/sleeper'
import { sqlString, StatsDb } from './db'
import { createDownloads } from './download'
import type {
  RefreshOptions,
  SelfTestResult,
  StatsLogEntry,
  StatsSyncResult,
  StatsWorkerInit
} from './protocol'
import { bootstrapStatsDb } from './schema'
import type { StatsState } from './sleeper'
import { refreshStats } from './sync'

/** The worker's state: the open database and what a refresh needs. Runnable in-process for tests. */
export interface StatsService {
  refresh(options: RefreshOptions): Promise<StatsSyncResult>
  selfTest(): Promise<SelfTestResult>
  /**
   * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
   * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
   */
  cancel(): void
  close(): void
}

/** The Sleeper NFL state, as the stats sync reads it. */
export async function fetchStatsState(): Promise<StatsState> {
  const s = await createSleeperClient().getNflState()
  return { season: Number(s.season), week: s.week, seasonType: s.season_type }
}

export async function openStatsService(
  init: StatsWorkerInit,
  onStep: (entry: StatsLogEntry) => void,
  nflState: () => Promise<StatsState> = fetchStatsState
): Promise<StatsService> {
  // Files a closed app left mid-step (downloads, staged Sleeper lines) are never read again.
  rmSync(init.tempDir, { recursive: true, force: true })
  mkdirSync(init.tempDir, { recursive: true })
  const db = await StatsDb.open(init.path, { tempDirectory: join(init.tempDir, 'duckdb') })
  await bootstrapStatsDb(db, new Date())
  const abort = new AbortController()
  let cancelled = false
  const downloads = createDownloads({ dir: init.tempDir, signal: abort.signal })
  return {
    refresh: (options) =>
      refreshStats(
        { db, downloads, tempDir: init.tempDir, nflState, onStep, cancelled: () => cancelled },
        options
      ),
    /**
     * Stats-analysis spec §3.3: write, read, a Parquet round trip, `read_json` and an ICU time zone,
     * through the real file (the parquet, json and icu extensions are statically linked).
     */
    async selfTest() {
      await db.exec('CREATE OR REPLACE TABLE self_test AS SELECT range AS x FROM range(1000)')
      const parquetPath = join(init.tempDir, 'self-test.parquet')
      await db.exec(`COPY self_test TO ${sqlString(parquetPath)} (FORMAT parquet)`)
      const back = await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM read_parquet(${sqlString(parquetPath)})`
      )
      const jsonPath = join(init.tempDir, 'self-test.json')
      await db.exec(`COPY (SELECT 1 AS x) TO ${sqlString(jsonPath)} (FORMAT json)`)
      const json = await db.get<{ x: number }>(`SELECT x FROM read_json(${sqlString(jsonPath)})`)
      const icu = await db.get<{ hour: number }>(
        "SELECT hour(timezone('UTC', timezone('America/New_York', TIMESTAMP '2026-01-10 16:30'))) AS hour"
      )
      const version = await db.get<{ v: string }>('SELECT version() AS v')
      await db.exec('DROP TABLE self_test')
      return {
        duckdb: version?.v ?? '?',
        rows: back?.n ?? 0,
        parquet: back?.n === 1000,
        json: json?.x === 1,
        icu: icu?.hour === 21
      }
    },
    cancel() {
      cancelled = true
      abort.abort()
      db.interrupt()
    },
    close: () => db.close()
  }
}
