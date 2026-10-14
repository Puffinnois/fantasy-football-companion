import type { Db } from '@main/db/connection'
import { listScoringIdentities } from '@main/db/repos/playerIds'
import { listPlayerPositions } from '@main/db/repos/players'
import { replacePoints, type PointsRecord } from '@main/db/repos/points'
import { getRules } from '@main/db/repos/rules'
import { listSleeperStats } from '@main/db/repos/sleeperStats'
import { listAllPlayerWeeks, listGames, listTeamWeeks, type GameRow } from '@main/db/repos/stats'
import { POSITIONS, type Position } from '@shared/rules'
import { offensiveYards, playerStatLine, sleeperStatLine, teamStatLine } from './adapters'
import { scoreStatLine } from './engine'

function asPosition(value: string | null): Position | null {
  return (POSITIONS as readonly string[]).includes(value ?? '') ? (value as Position) : null
}

const key = (team: string, season: number, week: number): string => `${team}|${season}|${week}`

/** `team|season|week` → points that team allowed, for games with a final score. */
export function pointsAllowedIndex(
  games: Pick<GameRow, 'season' | 'week' | 'homeTeam' | 'awayTeam' | 'homeScore' | 'awayScore'>[]
): Map<string, number> {
  const index = new Map<string, number>()
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue
    index.set(key(g.homeTeam, g.season, g.week), g.awayScore)
    index.set(key(g.awayTeam, g.season, g.week), g.homeScore)
  }
  return index
}

/**
 * Rebuilds `player_week_points` for the league from every stored stats row. Sleeper's own stat
 * lines come first (Sleeper stats scoring spec §3.5), keyed by Sleeper id. A player-week without
 * one falls back to nflverse (spec §7): players via `player_ids.gsis_id`, team defenses via
 * `player_ids.nflverse_team` with points/yards allowed from `games` / the opponent's team row.
 * Returns the number of rows written. Wrap in `withTransaction`.
 */
export function recomputePoints(db: Db, leagueId: string, updatedAt: string): number {
  const rules = getRules(db, leagueId)
  if (!rules) return replacePoints(db, leagueId, [], updatedAt)

  const byGsis = new Map<string, { playerId: string; position: Position | null }[]>()
  const byTeam = new Map<string, string[]>()
  for (const id of listScoringIdentities(db)) {
    if (id.gsisId) {
      const list = byGsis.get(id.gsisId) ?? []
      list.push({ playerId: id.playerId, position: asPosition(id.position) })
      byGsis.set(id.gsisId, list)
    }
    if (id.nflverseTeam)
      byTeam.set(id.nflverseTeam, [...(byTeam.get(id.nflverseTeam) ?? []), id.playerId])
  }

  const out: PointsRecord[] = []
  const scored = new Set<string>()
  const positions = listPlayerPositions(db)
  for (const s of listSleeperStats(db)) {
    if (!positions.has(s.playerId)) continue
    const position = asPosition(positions.get(s.playerId) ?? null)
    out.push({
      playerId: s.playerId,
      season: s.season,
      week: s.week,
      points: scoreStatLine(sleeperStatLine(s.stats, position), rules, position)
    })
    scored.add(key(s.playerId, s.season, s.week))
  }

  for (const row of listAllPlayerWeeks(db)) {
    const owners = byGsis.get(row.gsisId)
    if (!owners) continue
    const line = playerStatLine(row.stats)
    for (const o of owners) {
      if (scored.has(key(o.playerId, row.season, row.week))) continue
      out.push({
        playerId: o.playerId,
        season: row.season,
        week: row.week,
        points: scoreStatLine(line, rules, o.position)
      })
    }
  }

  const teamWeeks = listTeamWeeks(db)
  const teamIndex = new Map(teamWeeks.map((t) => [key(t.team, t.season, t.week), t]))
  const allowed = pointsAllowedIndex(listGames(db))
  for (const t of teamWeeks) {
    const owners = byTeam.get(t.team)
    if (!owners) continue
    const opponent = t.opponent ? teamIndex.get(key(t.opponent, t.season, t.week)) : undefined
    const line = teamStatLine(t.stats, {
      pointsAllowed: allowed.get(key(t.team, t.season, t.week)) ?? null,
      yardsAllowed: opponent ? offensiveYards(opponent.stats) : null
    })
    for (const playerId of owners) {
      if (scored.has(key(playerId, t.season, t.week))) continue
      out.push({
        playerId,
        season: t.season,
        week: t.week,
        points: scoreStatLine(line, rules, 'DEF')
      })
    }
  }
  return replacePoints(db, leagueId, out, updatedAt)
}
