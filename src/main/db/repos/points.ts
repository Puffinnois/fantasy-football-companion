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
