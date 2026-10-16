import type { StatsDb } from './db'

/**
 * Team codes the sources spell differently from nflverse today (stats-analysis spec §4.3, audit
 * fix 2): relocated franchises take their current code, so a franchise is one team in every season.
 */
export const TEAM_CODE_FIXES: Record<string, string> = {
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LA',
  LAR: 'LA',
  WSH: 'WAS',
  JAC: 'JAX'
}

const teamCase = Object.entries(TEAM_CODE_FIXES)
  .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
  .join(' ')

/**
 * Created on every open, so a new version replaces them. The tables keep their rows across
 * versions: `sync_log` is the stats steps' own log (status adds `interrupted`), `source_state`
 * what each source holds per season (season 0 = an all-seasons file).
 */
const BOOTSTRAP = [
  `CREATE OR REPLACE MACRO nfl_team(t) AS CASE t ${teamCase} ELSE t END`,
  // nflverse season types and game types (WC / DIV / CON / SB); preseason and unknown are NULL.
  `CREATE OR REPLACE MACRO season_type_of(g) AS
     CASE WHEN g = 'REG' THEN 'REG' WHEN g IN ('POST', 'WC', 'DIV', 'CON', 'SB') THEN 'POST' END`,
  'CREATE SEQUENCE IF NOT EXISTS sync_log_id',
  `CREATE TABLE IF NOT EXISTS sync_log (
     id BIGINT PRIMARY KEY DEFAULT nextval('sync_log_id'),
     source VARCHAR NOT NULL,
     started_at VARCHAR NOT NULL,
     finished_at VARCHAR,
     status VARCHAR NOT NULL,
     message VARCHAR,
     rows_written BIGINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS source_state (
     source VARCHAR NOT NULL,
     season INTEGER NOT NULL,
     version INTEGER NOT NULL,
     rows_written BIGINT NOT NULL,
     fetched_at VARCHAR NOT NULL,
     sealed BOOLEAN NOT NULL,
     PRIMARY KEY (source, season)
   )`
]

export const INTERRUPTED_MESSAGE = 'The app closed during this step'

/**
 * Creates the macros and bookkeeping tables, then marks steps a closed app left `running` as
 * `interrupted` (coverage audit 2026-10-14). Returns how many rows it marked.
 */
export async function bootstrapStatsDb(db: StatsDb, now: Date): Promise<number> {
  for (const sql of BOOTSTRAP) await db.exec(sql)
  const stale = await db.get<{ n: number }>(
    "SELECT count(*) AS n FROM sync_log WHERE status = 'running'"
  )
  await db.exec(
    "UPDATE sync_log SET status = 'interrupted', finished_at = ?, message = ? WHERE status = 'running'",
    [now.toISOString(), INTERRUPTED_MESSAGE]
  )
  return stale?.n ?? 0
}
