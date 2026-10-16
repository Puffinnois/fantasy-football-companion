import { mkdirSync } from 'node:fs'
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
  mkdirSync(init.tempDir, { recursive: true })
  const db = await StatsDb.open(init.path, { tempDirectory: join(init.tempDir, 'duckdb') })
  await bootstrapStatsDb(db, new Date())
  const downloads = createDownloads({ dir: init.tempDir })
  return {
    refresh: (options) =>
      refreshStats({ db, downloads, tempDir: init.tempDir, nflState, onStep }, options),
    /** Stats-analysis spec §3.3: write, read, and a Parquet round trip through the real file. */
    async selfTest() {
      await db.exec('CREATE OR REPLACE TABLE self_test AS SELECT range AS x FROM range(1000)')
      const parquetPath = join(init.tempDir, 'self-test.parquet')
      await db.exec(`COPY self_test TO ${sqlString(parquetPath)} (FORMAT parquet)`)
      const back = await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM read_parquet(${sqlString(parquetPath)})`
      )
      const version = await db.get<{ v: string }>('SELECT version() AS v')
      await db.exec('DROP TABLE self_test')
      return { duckdb: version?.v ?? '?', rows: back?.n ?? 0, parquet: back?.n === 1000 }
    },
    close: () => db.close()
  }
}
