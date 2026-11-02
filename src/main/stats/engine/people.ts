import type { Person } from '@shared/stats/types'
import type { StatsDb } from '../db'

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Ask spec §4.1: everyone with a regular-season game since 2019, as the resolver matches names. Each
 * person's latest position group and team, the seasons they played, their games, and their games
 * and PPR points in the current and prior season: the resolver prefers the player people mean when
 * two share a name (Lamar Jackson the quarterback, not the cornerback).
 */
export async function people(db: StatsDb): Promise<Person[]> {
  const rows = await db.all(
    `WITH cur AS (SELECT max(season) AS season FROM games),
     seasons AS (
       SELECT gsis_id, min(season) AS first_season, max(season) AS last_season,
              arg_max(position, season) AS position, arg_max(team, season) AS team,
              sum(games) AS games,
              sum(games) FILTER (WHERE season >= (SELECT season FROM cur) - 1) AS recent_games
       FROM player_season WHERE season_type = 'REG' AND games > 0 GROUP BY gsis_id),
     points AS (
       SELECT gsis_id, sum(points) AS recent_points FROM fantasy_week
       WHERE scoring = 'ppr' AND season_type = 'REG' AND gsis_id IS NOT NULL
         AND season >= (SELECT season FROM cur) - 1
       GROUP BY gsis_id)
     SELECT s.*, p.name, p.first_name, p.last_name, pt.recent_points
     FROM seasons s JOIN players p USING (gsis_id) LEFT JOIN points pt USING (gsis_id)
     ORDER BY s.gsis_id`
  )
  return rows.map((r) => ({
    id: String(r.gsis_id),
    name: String(r.name),
    firstName: text(r.first_name),
    lastName: text(r.last_name),
    position: text(r.position),
    team: text(r.team),
    firstSeason: num(r.first_season),
    lastSeason: num(r.last_season),
    games: num(r.games),
    recentGames: num(r.recent_games),
    recentPoints: Math.round(num(r.recent_points) * 10) / 10
  }))
}
