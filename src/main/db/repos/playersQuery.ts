import type { WeekStats } from '@shared/types'
import type { Db } from '../connection'
import { getPlayerIds } from './playerIds'
import { listWeekPoints } from './points'
import { listPlayerWeeks, listSnaps, listTeamWeeks } from './stats'

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
