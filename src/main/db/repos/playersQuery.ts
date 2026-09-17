import { toNflverseTeam } from '@shared/teams'
import type { PlayerFilter, PlayerRow, PointsContext, WeekStats } from '@shared/types'
import type { Db } from '../connection'
import { getPlayerIds } from './playerIds'
import { listWeekPoints, POINTS_CTE, round2 } from './points'
import { listPlayerWeeks, listSnaps, listTeamWeeks, teamByeWeeks } from './stats'

const SCORED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']

interface SearchRow {
  player_id: string
  full_name: string
  position: string | null
  team: string | null
  status: string | null
  injury_status: string | null
  owner_roster_id: number | null
  owner_name: string | null
  season_points: number | null
  last_week_points: number | null
  stats_available: number
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

/**
 * Players screen table: scored positions that are rostered, have points, or are active on an NFL
 * team. Ordered by season points, then Sleeper's search rank.
 */
export function searchPlayers(
  db: Db,
  leagueId: string,
  ctx: PointsContext,
  filter: PlayerFilter,
  limit = 200
): PlayerRow[] {
  const where = [
    `p.position IN (${SCORED_POSITIONS.map(() => '?').join(', ')})`,
    `(rp.player_id IS NOT NULL OR pts.season_points IS NOT NULL
      OR (p.team IS NOT NULL AND COALESCE(p.status, '') != 'Inactive'))`
  ]
  const params: (string | number | null)[] = [
    ctx.lastWeek,
    leagueId,
    ctx.season,
    leagueId,
    ...SCORED_POSITIONS
  ]
  if (filter.position) {
    where.push('p.position = ?')
    params.push(filter.position)
  }
  if (filter.team) {
    where.push('p.team = ?')
    params.push(filter.team)
  }
  if (filter.query?.trim()) {
    where.push("p.full_name LIKE ? ESCAPE '\\'")
    params.push(`%${escapeLike(filter.query.trim())}%`)
  }
  if (filter.owner === 'fa') where.push('rp.player_id IS NULL')
  else if (typeof filter.owner === 'number') {
    where.push('rp.roster_id = ?')
    params.push(filter.owner)
  }
  params.push(limit)

  const byes = teamByeWeeks(db, ctx.season)
  const rows = db
    .prepare(
      `${POINTS_CTE}
       SELECT p.player_id, p.full_name, p.position, p.team, p.status, p.injury_status,
         rp.roster_id AS owner_roster_id, COALESCE(t.team_name, t.display_name) AS owner_name,
         pts.season_points, pts.last_week_points,
         CASE WHEN i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL THEN 1 ELSE 0 END AS stats_available
       FROM players p
       LEFT JOIN pts ON pts.player_id = p.player_id
       LEFT JOIN roster_players rp ON rp.player_id = p.player_id AND rp.league_id = ?
       LEFT JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
       LEFT JOIN player_ids i ON i.player_id = p.player_id
       WHERE ${where.join(' AND ')}
       ORDER BY pts.season_points DESC NULLS LAST, p.search_rank ASC NULLS LAST, p.full_name
       LIMIT ?`
    )
    .all(...params) as unknown as SearchRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.position,
    team: r.team,
    status: r.status,
    injuryStatus: r.injury_status,
    ownerRosterId: r.owner_roster_id,
    ownerName: r.owner_name,
    byeWeek: r.team ? (byes.get(toNflverseTeam(r.team)) ?? null) : null,
    seasonPoints: round2(r.season_points),
    lastWeekPoints: round2(r.last_week_points),
    statsAvailable: r.stats_available === 1
  }))
}

/** Side panel: raw weekly rows for one player (team rows for a DEF) with snaps and the app's points. */
export function playerWeeklyStats(
  db: Db,
  leagueId: string,
  playerId: string,
  season: number
): WeekStats[] {
  const ids = getPlayerIds(db, playerId)
  if (!ids) return []
  const points = new Map(
    listWeekPoints(db, leagueId, playerId, season).map((p) => [p.week, p.points])
  )
  if (ids.nflverseTeam) {
    return listTeamWeeks(db)
      .filter((t) => t.team === ids.nflverseTeam && t.season === season)
      .map((t) => ({
        season,
        week: t.week,
        team: t.team,
        opponent: t.opponent,
        points: points.get(t.week) ?? null,
        stats: t.stats,
        snaps: null
      }))
  }
  if (!ids.gsisId) return []
  const snaps = new Map((ids.pfrId ? listSnaps(db, ids.pfrId, season) : []).map((s) => [s.week, s]))
  return listPlayerWeeks(db, ids.gsisId, season).map((w) => {
    const s = snaps.get(w.week)
    return {
      season,
      week: w.week,
      team: w.team,
      opponent: w.opponent,
      points: points.get(w.week) ?? null,
      stats: w.stats,
      snaps: s ? { offenseSnaps: s.offenseSnaps, offensePct: s.offensePct } : null
    }
  })
}
