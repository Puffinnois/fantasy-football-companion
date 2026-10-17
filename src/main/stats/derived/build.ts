import type { ScoringRules } from '@shared/stats/scoring'
import { sqlIdent, type StatsDb } from '../db'
import { STATS_FIRST_SEASON } from '../sources'
import { fantasyWeekSelect, scoringsToBuild, teamFantasyWeekSelect } from './fantasy'
import { playerSeasonSelect, playerWeekSelect } from './player'
import type { Built, Have } from './sql'
import { teamSeasonSelect, teamWeekSelect } from './team'

/** Bump to rebuild every season into new tables after a change to how they are built. */
export const DERIVED_VERSION = 1

/** The derived tables in build order: each reads the ones before it. */
export const DERIVED_TABLES = [
  'team_week',
  'player_week',
  'player_season',
  'team_season',
  'fantasy_week',
  'team_fantasy_week'
] as const
export type DerivedTable = (typeof DERIVED_TABLES)[number]
const FANTASY_TABLES: DerivedTable[] = ['fantasy_week', 'team_fantasy_week']

/** The sources a rebuild can read: tables, views and their columns. */
export async function inspect(db: StatsDb): Promise<Have> {
  const rows = await db.all<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM duckdb_columns() WHERE schema_name = 'main'"
  )
  const columns = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = columns.get(r.table_name) ?? new Set<string>()
    set.add(r.column_name)
    columns.set(r.table_name, set)
  }
  return { tables: new Set(columns.keys()), columns }
}

async function exists(db: StatsDb, table: string): Promise<boolean> {
  return (
    (await db.get("SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = ?", [
      table
    ])) !== null
  )
}

/** The derived tables need play-by-play and the schedule; without them there is nothing to build. */
export async function canDerive(db: StatsDb): Promise<boolean> {
  return (await exists(db, 'src_pbp')) && (await exists(db, 'games'))
}

/** The derived tables are missing or were built by an older `DERIVED_VERSION`. */
export async function derivedStale(db: StatsDb): Promise<boolean> {
  const state = await db.get<{ version: number }>(
    "SELECT version FROM derived_state WHERE name = 'derived'"
  )
  return (state?.version ?? 0) < DERIVED_VERSION || !(await exists(db, 'player_week'))
}

export interface RebuildInput {
  /** The seasons whose source rows changed, or every season (tables replaced). */
  seasons: number[] | 'all'
  /** The league's scoring rules, scored as `league` (spec §5.2); null without a league. */
  league: ScoringRules | null
  /** Only the fantasy tables (the league's rules changed). */
  fantasyOnly?: boolean
}

/**
 * Spec §5.2: rebuilds the derived tables for the seasons a sync touched, one season at a time
 * (bounded memory), each season in one transaction (delete its rows, insert them again), so a
 * reader sees a season's old rows or its new ones. `all`, or a new `DERIVED_VERSION`, replaces the
 * tables. Runs on one thread: writing `player_week` (about 230 columns) on two needs more than the
 * 512 MB limit. Returns the rows written per table.
 */
export async function rebuildDerived(
  db: StatsDb,
  input: RebuildInput
): Promise<Record<string, number>> {
  if (!(await canDerive(db))) return {}
  const have = await inspect(db)
  const stale = await derivedStale(db)
  const replace = stale || input.seasons === 'all'
  const known = (
    await db.all<{ season: number }>(
      `SELECT DISTINCT season FROM games WHERE season >= ${STATS_FIRST_SEASON} ORDER BY season`
    )
  ).map((r) => r.season)
  const seasons = replace ? known : known.filter((s) => (input.seasons as number[]).includes(s))
  const sleeper = have.tables.has('src_sleeper') || have.tables.has('src_sleeper_def')
  const tables = DERIVED_TABLES.filter((t) =>
    FANTASY_TABLES.includes(t) ? sleeper : !(input.fantasyOnly ?? false) || stale
  )
  const build: Record<DerivedTable, (season: number) => Built> = {
    team_week: (s) => teamWeekSelect(have, s),
    player_week: (s) => playerWeekSelect(have, s),
    player_season: (s) => playerSeasonSelect(have, s),
    team_season: (s) => teamSeasonSelect(s),
    fantasy_week: (s) => fantasyWeekSelect(have, s, scoringsToBuild(input.league)),
    team_fantasy_week: (s) => teamFantasyWeekSelect(s)
  }
  const written: Record<string, number> = {}
  const replaced = new Set<DerivedTable>()
  const threads = await db.get<{ t: string }>("SELECT current_setting('threads')::VARCHAR AS t")
  await db.exec('SET threads = 1')
  try {
    for (const season of seasons) {
      await db.transaction(async () => {
        for (const table of tables) {
          const built = build[table](season)
          for (const [temp, sql] of built.temps ?? []) {
            await db.exec(`CREATE OR REPLACE TEMP TABLE ${sqlIdent(temp)} AS ${sql}`)
          }
          if ((replace && !replaced.has(table)) || !(await exists(db, table))) {
            await db.exec(`CREATE OR REPLACE TABLE ${sqlIdent(table)} AS ${built.sql}`)
            replaced.add(table)
          } else {
            await db.exec(`DELETE FROM ${sqlIdent(table)} WHERE season = ${season}`)
            await db.exec(`INSERT INTO ${sqlIdent(table)} BY NAME ${built.sql}`)
          }
          for (const [temp] of built.temps ?? []) await db.exec(`DROP TABLE ${sqlIdent(temp)}`)
          const n = await db.get<{ n: number }>(
            `SELECT count(*) AS n FROM ${sqlIdent(table)} WHERE season = ${season}`
          )
          written[table] = (written[table] ?? 0) + (n?.n ?? 0)
        }
      })
    }
  } finally {
    await db.exec(`SET threads = ${Number(threads?.t ?? 2)}`)
  }
  if (stale) {
    await db.exec(`INSERT OR REPLACE INTO derived_state VALUES ('derived', ${DERIVED_VERSION})`)
  }
  return written
}
