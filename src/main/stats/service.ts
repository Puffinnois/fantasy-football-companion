import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createSleeperClient } from '@main/sources/sleeper'
import type { Scoring, ScoringRules } from '@shared/stats/scoring'
import { componentsOf, METRICS } from '@shared/stats/catalogue'
import type {
  GameForecast,
  GamesQuery,
  MetricInfo,
  OutlookQuery,
  PlayerBio,
  PlayerBioQuery,
  PlayerOutlook,
  StatsQuery,
  StatsResult,
  StatsStatus
} from '@shared/stats/types'
import { sqlString, StatsDb } from './db'
import { derivedStale, rebuildDerived } from './derived/build'
import { createDownloads } from './download'
import { StatsQueryError, type CompileContext } from './engine/compile'
import { gameForecasts } from './engine/games'
import { playerOutlook } from './engine/outlook'
import { playerBio } from './engine/player'
import { catalogueInfo, MODEL_SUMS, QUANTILES } from './engine/registry'
import { runQuery } from './engine/run'
import { modelsStale } from './models/build'
import { readStability } from './models/stability'
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
   * fantasy tables were built with, those are rebuilt; resolves true then. Until the tables first
   * hold a league's points, its reads answer that the scoring is still being applied.
   */
  setLeague(rules: ScoringRules | null): Promise<boolean>
  selfTest(): Promise<SelfTestResult>
  /** Spec §7: one query on the read connection; it runs while a refresh writes. */
  query(query: StatsQuery): Promise<StatsResult>
  /** The catalogue with each metric's stability (spec §8.6), once the models have measured it. */
  catalogue(): Promise<MetricInfo[]>
  status(): Promise<StatsStatus>
  /** Spec §8.1: a season's games with Elo and the betting market. */
  games(query: GamesQuery): Promise<GameForecast[]>
  /** Spec §8.5: a player's outlook. */
  outlook(query: OutlookQuery): Promise<PlayerOutlook>
  /** Spec §9.4: a player's identity and status now. */
  player(query: PlayerBioQuery): Promise<PlayerBio>
  /**
   * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
   * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
   */
  cancel(): void
  close(): Promise<void>
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

/** Whether a query reads a model table (spec §8): those exist once the first models step ran. */
function readsModels(query: StatsQuery): boolean {
  const sums = new Set(MODEL_SUMS[query.entity] ?? [])
  return (query.metrics ?? []).some((id) => {
    const def = METRICS.get(id)
    return (
      def !== undefined &&
      componentsOf(def).some((t) => t.startsWith('last:') || sums.has(t) || t in QUANTILES)
    )
  })
}

const BUILDING = 'the stats are still being built; try again in a few minutes'
const SCORING = 'the league’s scoring is still being applied; the screens update when it is done'

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
  // Spec §2: each read gets its own connection, so it runs while a refresh writes, never waits
  // behind another read, and its timeout interrupts only itself.
  const reading = new Set<StatsDb>()
  const inFlight = new Set<Promise<unknown>>()
  let closing = false
  const read = async <T>(fn: (conn: StatsDb) => Promise<T>): Promise<T> => {
    if (closing) throw new Error('the stats database is closing')
    const conn = await db.connect()
    reading.add(conn)
    const run = fn(conn).finally(() => {
      reading.delete(conn)
      conn.close()
    })
    inFlight.add(run)
    void run.then(
      () => inFlight.delete(run),
      () => inFlight.delete(run)
    )
    return run
  }
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
  // A league's first scoring: until it is done, its reads would find no points for anyone.
  const scoringFirst = (scoring: Scoring | undefined): void => {
    if (scoring === 'league' && league !== null && built === null) {
      throw new StatsQueryError(SCORING)
    }
  }
  const contextOf = async (conn: StatsDb): Promise<CompileContext> => {
    const latest = await conn.get<{ season: number }>('SELECT max(season) AS season FROM games')
    return {
      currentSeason: latest?.season ?? new Date().getFullYear(),
      hasLeague: league !== null
    }
  }
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
    query: async (query) => {
      scoringFirst(query.scoring)
      return read(async (conn) => {
        if (await derivedStale(conn)) throw new StatsQueryError(BUILDING)
        if (readsModels(query) && (await modelsStale(conn))) throw new StatsQueryError(BUILDING)
        const ctx = await contextOf(conn)
        if (query.transform === 'shrunk') {
          const stability = await readStability(conn)
          ctx.priors = new Map(
            [...stability]
              .filter(([, s]) => s.prior !== null)
              .map(([id, s]) => [id, s.prior as number])
          )
        }
        return runQuery(conn, query, ctx)
      })
    },
    catalogue: () => read(async (conn) => catalogueInfo(await readStability(conn))),
    games: (query) =>
      read(async (conn) => {
        if (await modelsStale(conn)) throw new StatsQueryError(BUILDING)
        return gameForecasts(conn, query)
      }),
    outlook: async (query) => {
      scoringFirst(query.scoring)
      return read(async (conn) => {
        if ((await derivedStale(conn)) || (await modelsStale(conn))) {
          throw new StatsQueryError(BUILDING)
        }
        return playerOutlook(conn, query, await contextOf(conn), await readStability(conn))
      })
    },
    player: (query) => read((conn) => playerBio(conn, query)),
    status: () =>
      read(async (reader) => {
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
      }),
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
      for (const conn of reading) conn.interrupt()
    },
    /** Refuses new reads, waits for the running ones (interrupted by `cancel`), then closes. */
    async close() {
      closing = true
      await Promise.allSettled([...inFlight])
      db.close()
    }
  }
}
