import type { PointsContext } from '@shared/types'
import type { Db } from '../connection'

export type { PointsContext }

export const NO_POINTS_CONTEXT: PointsContext = { season: 0, lastWeek: null }

export interface PointsRecord {
  playerId: string
  season: number
  week: number
  points: number
}

/** Replaces every points row of the league. Wrap in `withTransaction`. */
export function replacePoints(
  db: Db,
  leagueId: string,
  records: PointsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_points WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    'INSERT OR REPLACE INTO player_week_points (league_id, player_id, season, week, points, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  let written = 0
  for (const r of records) {
    insert.run(leagueId, r.playerId, r.season, r.week, r.points, updatedAt)
    written++
  }
  return written
}

export function countPoints(db: Db, leagueId: string): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM player_week_points WHERE league_id = ?')
      .get(leagueId) as {
      n: number
    }
  ).n
}

export function latestPointsWeek(db: Db, leagueId: string, season: number): number | null {
  const row = db
    .prepare('SELECT MAX(week) AS w FROM player_week_points WHERE league_id = ? AND season = ?')
    .get(leagueId, season) as { w: number | null }
  return row.w
}

export function listWeekPoints(
  db: Db,
  leagueId: string,
  playerId: string,
  season: number
): { week: number; points: number }[] {
  return db
    .prepare(
      'SELECT week, points FROM player_week_points WHERE league_id = ? AND player_id = ? AND season = ? ORDER BY week'
    )
    .all(leagueId, playerId, season) as unknown as { week: number; points: number }[]
}

/**
 * CTE giving each player's season total and last-week points. Bind, in order:
 * `lastWeek` (nullable), `leagueId`, `season` — before the outer query's own parameters.
 */
export const POINTS_CTE = `WITH pts AS (
  SELECT player_id, SUM(points) AS season_points,
         SUM(CASE WHEN week = ? THEN points END) AS last_week_points
  FROM player_week_points WHERE league_id = ? AND season = ? GROUP BY player_id
)`

/** SQL SUMs of 2-decimal values carry float noise (30.200000000000003). */
export function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100
}

/** player id → points for one week of the league's season. */
export function listPointsByWeek(
  db: Db,
  leagueId: string,
  season: number,
  week: number
): Map<string, number> {
  const rows = db
    .prepare(
      'SELECT player_id, points FROM player_week_points WHERE league_id = ? AND season = ? AND week = ?'
    )
    .all(leagueId, season, week) as unknown as { player_id: string; points: number }[]
  return new Map(rows.map((r) => [r.player_id, r.points]))
}
