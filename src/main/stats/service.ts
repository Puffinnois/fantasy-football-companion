import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createSleeperClient } from '@main/sources/sleeper'
import type { ScoringRules } from '@shared/stats/scoring'
import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
import { sqlString, StatsDb } from './db'
import { derivedStale, rebuildDerived } from './derived/build'
import { createDownloads } from './download'
import { StatsQueryError } from './engine/compile'
import { catalogueInfo } from './engine/registry'
import { runQuery } from './engine/run'
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
  /**
   * The league's scoring rules (null without a league). When they differ from the ones the
   * fantasy tables were built with, those are rebuilt; resolves true then.
   */
  setLeague(rules: ScoringRules | null): Promise<boolean>
  selfTest(): Promise<SelfTestResult>
  /** Spec §7: one query on the read connection; it runs while a refresh writes. */
  query(query: StatsQuery): Promise<StatsResult>
  catalogue(): MetricInfo[]
  status(): Promise<StatsStatus>
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

const LEAGUE_KEY = 'league_rules'

/** Rules as stored and compared: keys sorted, so the same rules always give the same text. */
export function rulesKey(rules: ScoringRules | null): string | null {
  if (!rules) return null
  const sorted = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]])
    )
  const overrides = rules.positionOverrides as Record<string, Record<string, number>>
  return JSON.stringify({
    scoring: sorted(rules.scoring),
    positionOverrides: Object.fromEntries(
      Object.keys(overrides)
        .sort()
        .map((p) => [p, sorted(overrides[p])])
    )
  })
}

/**
 * Spec §11: the engine answers a team query over two one-game seasons of a throwaway schema, which
 * proves the catalogue, the compiler and DuckDB's window functions in the packaged worker.
 */
async function selfTestQuery(db: StatsDb): Promise<boolean> {
  await db.exec('CREATE SCHEMA IF NOT EXISTS self_test')
  await db.exec('SET search_path = self_test')
  try {
    const game = (team: string, wins: number): string =>
      `SELECT '${team}' AS team, 2025 AS season, 'REG' AS season_type, 1 AS week, 1 AS games, ${wins} AS wins, 0 AS ties`
    await db.exec(
      `CREATE OR REPLACE TABLE team_season AS ${game('BUF', 1)} UNION ALL ${game('KC', 0)}`
    )
    await db.exec('CREATE OR REPLACE TABLE team_week AS SELECT * FROM team_season')
    const result = await runQuery(
      db,
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] } },
      { currentSeason: 2025, hasLeague: false }
    )
    return (
      result.rows.map((r) => `${r.id} ${r.values.win_pct.percentile}`).join(',') === 'BUF 100,KC 0'
    )
  } finally {
    await db.exec('SET search_path = main')
    await db.exec('DROP SCHEMA self_test CASCADE')
  }
}

/** Rules reach SQL as numbers: anything else is refused (main validates them too). */
function checkRules(rules: ScoringRules | null): void {
  if (!rules) return
  const all = [
    ...Object.entries(rules.scoring),
    ...Object.values(rules.positionOverrides).flatMap((o) => Object.entries(o ?? {}))
  ]
  for (const [key, points] of all) {
    if (typeof points !== 'number' || !Number.isFinite(points) || !/^[a-z0-9_]+$/.test(key)) {
      throw new Error(`league rules: ${key} must be a number`)
    }
  }
  for (const position of Object.keys(rules.positionOverrides)) {
    if (!/^[A-Z]{1,3}$/.test(position))
      throw new Error(`league rules: unknown position ${position}`)
  }
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
  // Spec §2: screens read on their own connection while a refresh writes on this one.
  const reader = await db.connect()
  const abort = new AbortController()
  let cancelled = false
  let busy = false
  const stored = await db.get<{ value: string | null }>(
    'SELECT value FROM stats_settings WHERE key = ?',
    [LEAGUE_KEY]
  )
  let league = stored?.value ? (JSON.parse(stored.value) as ScoringRules) : null
  /** The rules the fantasy tables were built with. */
  let built = stored?.value ?? null
  const downloads = createDownloads({ dir: init.tempDir, signal: abort.signal })
  const whileBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
    busy = true
    try {
      return await fn()
    } finally {
      busy = false
    }
  }
  return {
    refresh: (options) =>
      whileBusy(() =>
        refreshStats(
          {
            db,
            downloads,
            tempDir: init.tempDir,
            nflState,
            onStep,
            cancelled: () => cancelled,
            league: () => league
          },
          options
        )
      ),
    async setLeague(rules) {
      checkRules(rules)
      league = rules
      const key = rulesKey(rules)
      if (key === built) return false
      const save = async (): Promise<void> => {
        await db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [LEAGUE_KEY, key])
        built = key
      }
      // Before the first build, the next refresh builds everything, the league's scoring included.
      if (await derivedStale(db)) {
        await save()
        return false
      }
      // Saved once the fantasy tables hold these rules: a failed rescoring is retried next time.
      await whileBusy(() =>
        rebuildDerived(db, { seasons: 'all', league: rules, fantasyOnly: true })
      )
      await save()
      return true
    },
    async query(query) {
      if (await derivedStale(reader)) {
        throw new StatsQueryError('the stats are still being built; try again in a few minutes')
      }
      const latest = await reader.get<{ season: number }>('SELECT max(season) AS season FROM games')
      return runQuery(reader, query, {
        currentSeason: latest?.season ?? new Date().getFullYear(),
        hasLeague: league !== null
      })
    },
    catalogue: () => catalogueInfo(),
    async status() {
      const built = !(await derivedStale(reader))
      const through = built
        ? await reader.get<{ season: number; season_type: 'REG' | 'POST'; week: number }>(
            `SELECT season, season_type, week FROM team_week WHERE games = 1
             ORDER BY season DESC, season_type = 'POST' DESC, week DESC LIMIT 1`
          )
        : null
      const updated = await reader.get<{ at: string | null }>(
        "SELECT max(finished_at) AS at FROM sync_log WHERE status = 'ok' AND rows_written > 0"
      )
      return {
        available: true,
        through: through
          ? { season: through.season, seasonType: through.season_type, week: through.week }
          : null,
        updatedAt: updated?.at ?? null,
        busy
      }
    },
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
        icu: icu?.hour === 21,
        query: await selfTestQuery(db)
      }
    },
    cancel() {
      cancelled = true
      abort.abort()
      db.interrupt()
      reader.interrupt()
    },
    close() {
      reader.close()
      db.close()
    }
  }
}
