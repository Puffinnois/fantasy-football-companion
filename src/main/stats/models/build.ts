import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { writeTable } from '../identity'
import { PLAYER_MODEL_SUMS, TEAM_MODEL_SUMS, TEAM_STATES, TURNOVER_SUMS } from './columns'
import { homeFieldOf, ratingsAfter, runElo, type EloGame, type EloRow } from './elo'
import { fgProbability, fitFieldGoals, FG_FEATURES } from './fieldGoal'
import { loadCells, loadFieldGoals, loadGames, turnoversSql, type Kick } from './load'
import { profileSql } from './profile'
import { simulateSeason, SIM_RUNS, type TeamOdds } from './simulate'
import { measureStability, writeStability } from './stability'
import { gameSums, regWeeks, teamWeekRows, type FgSums } from './team'

/** Bump to rebuild every model table (and every cached simulation) after a model change. */
export const MODELS_VERSION = 1
/** Simulations of sealed seasons' weeks (history for trend charts) run fewer times. */
export const HISTORY_RUNS = 2_000

export const MODEL_TABLES = [
  'elo_games',
  'team_forecast',
  'team_model_week',
  'player_model_week',
  'player_profile'
] as const

async function exists(db: StatsDb, table: string): Promise<boolean> {
  return (
    (await db.get("SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = ?", [
      table
    ])) !== null
  )
}

/** The model tables are missing or were built by an older `MODELS_VERSION`. */
export async function modelsStale(db: StatsDb): Promise<boolean> {
  const state = await db.get<{ version: number }>(
    "SELECT version FROM derived_state WHERE name = 'models'"
  )
  if ((state?.version ?? 0) < MODELS_VERSION) return true
  for (const t of MODEL_TABLES) if (!(await exists(db, t))) return true
  return false
}

/** The models need the derived tables (stability reads them) and play-by-play. */
export async function canModel(db: StatsDb): Promise<boolean> {
  return (
    (await exists(db, 'player_week')) &&
    (await exists(db, 'team_week')) &&
    (await exists(db, 'src_pbp'))
  )
}

/** Whether stability must be measured: never measured, or through an older season. */
export async function stabilityDue(db: StatsDb, through: number): Promise<boolean> {
  if (!(await exists(db, 'metric_stability'))) return true
  const row = await db.get<{ t: number | null }>('SELECT max(through) AS t FROM metric_stability')
  return (row?.t ?? 0) < through
}

export interface ModelsInput {
  /** Measure metric stability again (a past season changed, or it was never measured). */
  stability: boolean
  /** The last season stability reads: the prior season. */
  through: number
  /** Simulation runs of the current season's weeks (`SIM_RUNS`); sealed seasons run at most `HISTORY_RUNS`. */
  runs?: number
}

export interface ModelsResult {
  rows: Record<string, number>
  /** Season-weeks simulated (the others were cached). */
  simulated: number
  /** Metrics whose stability was measured; 0 when it was kept. */
  measured: number
}

type CachedOdds = TeamOdds & { runs: number }

const ODDS: (keyof TeamOdds)[] = [
  'wins',
  'losses',
  'ties',
  'playoffs',
  'division',
  'bye',
  'conference',
  'superBowl'
]

/**
 * Spec §8.1: the season simulation as of every regular-season week, cached in `team_forecast`.
 * Sealed weeks are kept; the current season's latest cached week (it may have been part-played)
 * and any new one run again. Returns `season` → `team|week` → odds, and how many weeks ran.
 */
async function simulations(
  db: StatsDb,
  games: EloGame[],
  elo: EloRow[],
  lastPlayed: Map<number, number>,
  options: { stale: boolean; current: number; runs: number }
): Promise<{ odds: Map<number, Map<string, CachedOdds>>; simulated: number }> {
  const cached =
    options.stale || !(await exists(db, 'team_forecast'))
      ? []
      : await db.all<CachedOdds & { season: number; week: number }>('SELECT * FROM team_forecast')
  const odds = new Map<number, Map<string, CachedOdds>>()
  const add = (season: number, week: number, o: CachedOdds): void => {
    const map = odds.get(season) ?? new Map<string, CachedOdds>()
    map.set(`${o.team}|${week}`, o)
    odds.set(season, map)
  }
  for (const r of cached) add(r.season, r.week, r)
  let simulated = 0
  for (const season of [...lastPlayed.keys()].sort((a, b) => a - b)) {
    const reg = games.filter((g) => g.season === season && g.season_type === 'REG')
    const last = Math.min(lastPlayed.get(season) ?? 0, regWeeks(season))
    const weeks = new Set(cached.filter((r) => r.season === season).map((r) => r.week))
    const latest = Math.max(-1, ...weeks)
    const runs = season === options.current ? options.runs : Math.min(options.runs, HISTORY_RUNS)
    for (let w = 0; w <= last; w++) {
      if (weeks.has(w) && !(season === options.current && w >= latest)) continue
      const result = simulateSeason({
        season,
        games: reg.map((g) => ({
          week: g.week,
          home: g.home_team,
          away: g.away_team,
          homeField: homeFieldOf(g),
          result: g.week <= w ? g.result : null
        })),
        ratings: ratingsAfter(elo, season, w),
        runs,
        seed: season * 100 + w
      })
      for (const o of result) add(season, w, { ...o, runs })
      simulated += 1
    }
  }
  return { odds, simulated }
}

/**
 * Spec §8.4: the FG model fitted on every attempt before the current season (all of them in a
 * first season), then each attempt's make probability summed by kicker and by team per week.
 */
function fieldGoals(
  kicks: Kick[],
  current: number
): {
  beta: number[] | null
  through: number | null
  players: Map<string, FgSums>
  teams: Map<string, FgSums>
} {
  const train = kicks.filter((k) => k.season < current)
  const fitted = train.length > 0 ? train : kicks
  const beta = fitted.length > 0 ? fitFieldGoals(fitted) : null
  const players = new Map<string, FgSums>()
  const teams = new Map<string, FgSums>()
  for (const k of beta ? kicks : []) {
    const p = fgProbability(k, beta as number[])
    const keys: [Map<string, FgSums>, string | null][] = [
      [players, k.kicker && `${k.kicker}|${k.season}|${k.season_type}|${k.week}`],
      [teams, k.team && `${k.team}|${k.season}|${k.week}`]
    ]
    for (const [map, key] of keys) {
      if (!key) continue
      const s = map.get(key) ?? { fg_model_att: 0, fg_model_made: 0, fg_xmade: 0 }
      s.fg_model_att += 1
      s.fg_model_made += k.made ? 1 : 0
      s.fg_xmade += p
      map.set(key, s)
    }
  }
  const through = fitted.length > 0 ? Math.max(...fitted.map((k) => k.season)) : null
  return { beta, through, players, teams }
}

const ELO_GAME_COLUMNS: Record<string, string> = {
  game_id: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  home_team: 'VARCHAR',
  away_team: 'VARCHAR',
  played: 'BOOLEAN',
  home_elo_pre: 'DOUBLE',
  away_elo_pre: 'DOUBLE',
  home_field: 'DOUBLE',
  home_wp: 'DOUBLE',
  elo_spread: 'DOUBLE',
  vegas_home_wp: 'DOUBLE',
  home_elo_post: 'DOUBLE',
  away_elo_post: 'DOUBLE'
}

const FORECAST_COLUMNS: Record<string, string> = {
  team: 'VARCHAR',
  season: 'INTEGER',
  week: 'INTEGER',
  runs: 'INTEGER',
  ...Object.fromEntries(ODDS.map((o) => [o, 'DOUBLE']))
}

/** `team_model_week` before the turnover sums are joined (they come from SQL). */
const TEAM_CORE_COLUMNS: Record<string, string> = {
  team: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  ...Object.fromEntries(TEAM_STATES.map((s) => [s, s === 'games_left' ? 'INTEGER' : 'DOUBLE'])),
  ...Object.fromEntries(
    TEAM_MODEL_SUMS.filter((s) => !(TURNOVER_SUMS as readonly string[]).includes(s)).map((s) => [
      s,
      'DOUBLE'
    ])
  )
}

const PLAYER_MODEL_COLUMNS: Record<string, string> = {
  gsis_id: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  ...Object.fromEntries(PLAYER_MODEL_SUMS.map((s) => [s, 'DOUBLE']))
}

const valuesOf = (columns: Record<string, string>, row: object): unknown[] =>
  Object.keys(columns).map((c) => (row as Record<string, unknown>)[c] ?? null)

/**
 * Spec §8: rebuilds the model tables from the raw and derived layers, in one transaction. Elo
 * runs over every game; adjusted EPA, SRS and schedule strength are fitted as of every week; the
 * season simulation is cached per week; the FG model is refitted. Then, when asked (a past season
 * changed), metric stability is measured on the tables just written.
 */
export async function rebuildModels(db: StatsDb, input: ModelsInput): Promise<ModelsResult> {
  const stale = await modelsStale(db)
  const have = await inspect(db)
  const games = await loadGames(db, have)
  const current = Math.max(0, ...games.map((g) => g.season))
  const { rows: elo } = runElo(games)
  const cells = await loadCells(db, have)
  const kicks = await loadFieldGoals(db, have)
  const lastPlayed = new Map<number, number>()
  for (const g of games) {
    const last = lastPlayed.get(g.season) ?? 0
    lastPlayed.set(g.season, g.result !== null ? Math.max(last, g.week) : last)
  }
  const sims = await simulations(db, games, elo, lastPlayed, {
    stale,
    current,
    runs: input.runs ?? SIM_RUNS
  })
  const fg = fieldGoals(kicks, current)
  const sums = gameSums(elo)
  const teamRows = [...lastPlayed.keys()]
    .sort((a, b) => a - b)
    .flatMap((season) => {
      const kicksOf = new Map<string, FgSums>()
      for (const [key, s] of fg.teams) {
        const [team, year, week] = key.split('|')
        if (Number(year) === season) kicksOf.set(`${team}|${week}`, s)
      }
      return teamWeekRows({
        season,
        lastWeek: lastPlayed.get(season) ?? 0,
        games,
        elo,
        cells,
        forecast: sims.odds.get(season) ?? new Map(),
        kicks: kicksOf,
        sums
      })
    })

  const written: Record<string, number> = {}
  await db.transaction(async () => {
    await writeTable(
      db,
      'elo_games',
      ELO_GAME_COLUMNS,
      elo.map((r) => valuesOf(ELO_GAME_COLUMNS, r))
    )
    await writeTable(
      db,
      'team_forecast',
      FORECAST_COLUMNS,
      [...sims.odds].flatMap(([season, map]) =>
        [...map].map(([key, o]) =>
          valuesOf(FORECAST_COLUMNS, { ...o, season, week: Number(key.split('|')[1]) })
        )
      )
    )
    await writeTable(
      db,
      'team_model_core',
      TEAM_CORE_COLUMNS,
      teamRows.map((r) => valuesOf(TEAM_CORE_COLUMNS, r))
    )
    // Fumble counts are 0 in a week without them; expected interceptions stay NULL before FTN.
    const turnover = (x: string): string =>
      x.endsWith('_xints') ? `t.${x}::DOUBLE AS ${x}` : `coalesce(t.${x}, 0)::DOUBLE AS ${x}`
    await db.exec(`CREATE OR REPLACE TABLE team_model_week AS
      SELECT c.*, ${TURNOVER_SUMS.map(turnover).join(', ')}
      FROM team_model_core c LEFT JOIN (${turnoversSql(have)}) t
        ON t.team = c.team AND t.season = c.season AND t.week = c.week`)
    await db.exec('DROP TABLE team_model_core')
    await writeTable(
      db,
      'player_model_week',
      PLAYER_MODEL_COLUMNS,
      [...fg.players].map(([key, s]) => {
        const [gsis_id, season, season_type, week] = key.split('|')
        return valuesOf(PLAYER_MODEL_COLUMNS, {
          gsis_id,
          season: Number(season),
          season_type,
          week: Number(week),
          ...s
        })
      })
    )
    await db.exec(`CREATE OR REPLACE TABLE player_profile AS ${profileSql(have.tables)}`)
    await db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [
      'fg_model',
      JSON.stringify({ features: FG_FEATURES, beta: fg.beta, fittedThrough: fg.through })
    ])
    for (const t of MODEL_TABLES) {
      written[t] = (await db.get<{ n: number }>(`SELECT count(*)::INTEGER AS n FROM ${t}`))?.n ?? 0
    }
  })
  // Stability reads the tables just written (FG over expected, ratings); the version is saved
  // once both are in, so an interrupted step runs again.
  const stability = input.stability || stale ? await measureStability(db, input.through) : null
  await db.transaction(async () => {
    if (stability) await writeStability(db, stability, input.through)
    await db.exec(`INSERT OR REPLACE INTO derived_state VALUES ('models', ${MODELS_VERSION})`)
  })
  return { rows: written, simulated: sims.simulated, measured: stability?.size ?? 0 }
}
