import {
  offensiveYards,
  playerStatLine,
  teamStatLine,
  withDisplayStats,
  withKickingBuckets
} from '@main/scoring/adapters'
import { scoreStatLine } from '@main/scoring/engine'
import { pointsAllowedIndex } from '@main/scoring/recompute'
import { asPosition, type Rules } from '@shared/rules'
import { toNflverseTeam, toSleeperTeam } from '@shared/teams'
import type { NflState, PlayerBaseRow, RosterSlot } from '@shared/types'
import type { Db } from '../db/connection'
import { getLeague } from '../db/repos/leagues'
import { baseRow, listCandidates } from '../db/repos/playersWeek'
import { listPointsBySeason } from '../db/repos/points'
import { listProjectionsBySeason, type ProjectionRecord } from '../db/repos/projections'
import { getRules } from '../db/repos/rules'
import { getNflState } from '../db/repos/state'
import { listTeams } from '../db/repos/teams'
import {
  listPlayerWeeksBySeason,
  listRegularSeasonGames,
  listSnapsBySeason,
  listTeamWeeksBySeason,
  teamByeWeeks,
  type PlayerWeekRow as StatsRow,
  type TeamWeekRow
} from '../db/repos/stats'

export const LAST_WEEK = 18

export interface SeriesWeek {
  week: number
  /** Sleeper code of the opponent (schedule first, projection row as fallback); null without one. */
  opponent: string | null
  /** true when the league has a points row: the team played and the stats are in. */
  played: boolean
  points: number | null
  /** Projection scored under the league rules; null without a stored projection. */
  projected: number | null
  /** Actual line in Sleeper keys (+ display keys); {} when there is no stat row. */
  line: Record<string, number>
  snapPct: number | null
  targetShare: number | null
  rushShare: number | null
  airYardsShare: number | null
  wopr: number | null
}

export interface PlayerSeries {
  base: PlayerBaseRow
  statsAvailable: boolean
  /** Roster slot on the owning team; null for free agents. */
  rosterSlot: RosterSlot | null
  /** Ascending; only weeks with a game, a projection or a points row. */
  weeks: SeriesWeek[]
}

export interface SeriesBundle {
  season: number
  currentWeek: number
  projectionsStored: boolean
  teamCount: number
  /** A `teams` row of the league is flagged `is_me`. */
  hasMyTeam: boolean
  rules: Rules | null
  /** Sleeper team → week → Sleeper opponent, regular season. */
  schedule: Map<string, Map<number, string>>
  players: PlayerSeries[]
}

/** Week ROS starts from: Sleeper's week clamped to 1..18; a past season is fully played (19), a future one untouched (1). */
export function currentWeekFor(season: number, state: NflState | null): number {
  if (!state) return 1
  const stateSeason = Number(state.season)
  if (season < stateSeason) return LAST_WEEK + 1
  if (season > stateSeason) return 1
  return Math.min(Math.max(state.week, 1), LAST_WEEK)
}

function nested<T>(
  items: T[],
  outer: (t: T) => string,
  inner: (t: T) => number
): Map<string, Map<number, T>> {
  const map = new Map<string, Map<number, T>>()
  for (const item of items) {
    const key = outer(item)
    let byWeek = map.get(key)
    if (!byWeek) {
      byWeek = new Map()
      map.set(key, byWeek)
    }
    byWeek.set(inner(item), item)
  }
  return map
}

function share(numerator: number | undefined, denominator: number | undefined): number | null {
  return numerator !== undefined && denominator ? numerator / denominator : null
}

/** One pass over the season: every candidate with its per-week points, projection, line and usage. */
export function loadSeries(db: Db, leagueId: string, season: number): SeriesBundle {
  const league = getLeague(db, leagueId)
  const rules = getRules(db, leagueId)
  const currentWeek = currentWeekFor(season, getNflState(db))
  const byes = teamByeWeeks(db, season)
  const games = listRegularSeasonGames(db, season)
  const allowed = pointsAllowedIndex(games)
  const schedule = new Map<string, Map<number, string>>()
  const addGame = (team: string, week: number, opponent: string): void => {
    if (!schedule.has(team)) schedule.set(team, new Map())
    schedule.get(team)?.set(week, opponent)
  }
  for (const g of games) {
    addGame(g.homeTeam, g.week, g.awayTeam)
    addGame(g.awayTeam, g.week, g.homeTeam)
  }
  const points = nested(
    listPointsBySeason(db, leagueId, season),
    (p) => p.playerId,
    (p) => p.week
  )
  const projectionRows = listProjectionsBySeason(db, season)
  const projections = nested<ProjectionRecord>(
    projectionRows,
    (p) => p.playerId,
    (p) => p.week
  )
  const stats = nested<StatsRow>(
    listPlayerWeeksBySeason(db, season),
    (s) => s.gsisId,
    (s) => s.week
  )
  const teamWeeks = nested<TeamWeekRow>(
    listTeamWeeksBySeason(db, season),
    (t) => t.team,
    (t) => t.week
  )
  const snaps = nested(
    listSnapsBySeason(db, season),
    (s) => s.pfrId,
    (s) => s.week
  )

  const players = listCandidates(db, leagueId).map((r): PlayerSeries => {
    const base = baseRow(r, byes)
    const position = asPosition(r.pos)
    const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
    const teamSchedule = nflverseTeam ? schedule.get(nflverseTeam) : undefined
    const playerPoints = points.get(r.player_id)
    const playerProjections = projections.get(r.player_id)
    const playerStats = r.gsis_id ? stats.get(r.gsis_id) : undefined
    const playerSnaps = r.pfr_id ? snaps.get(r.pfr_id) : undefined
    const defenseWeeks = r.nflverse_team ? teamWeeks.get(r.nflverse_team) : undefined

    const weeks: SeriesWeek[] = []
    for (let week = 1; week <= LAST_WEEK; week++) {
      const scheduled = teamSchedule?.get(week) ?? null
      const projection = playerProjections?.get(week) ?? null
      const pts = playerPoints?.get(week)?.points
      if (scheduled === null && !projection && pts === undefined) continue

      let line: Record<string, number> = {}
      let targetShare: number | null = null
      let rushShare: number | null = null
      let airYardsShare: number | null = null
      let wopr: number | null = null
      if (defenseWeeks) {
        const t = defenseWeeks.get(week)
        if (t) {
          const opp = t.opponent ? teamWeeks.get(t.opponent)?.get(week) : undefined
          line = withKickingBuckets(
            teamStatLine(t.stats, {
              pointsAllowed: allowed.get(`${t.team}|${season}|${week}`) ?? null,
              yardsAllowed: opp ? offensiveYards(opp.stats) : null
            })
          ) as Record<string, number>
        }
      } else if (playerStats) {
        const s = playerStats.get(week)
        if (s) {
          line = withKickingBuckets(withDisplayStats(playerStatLine(s.stats), s.stats)) as Record<
            string,
            number
          >
          const team = s.team ? teamWeeks.get(s.team)?.get(week)?.stats : undefined
          targetShare = s.stats.target_share ?? share(s.stats.targets, team?.attempts)
          rushShare = share(s.stats.carries, team?.carries)
          airYardsShare =
            s.stats.air_yards_share ?? share(s.stats.receiving_air_yards, team?.passing_air_yards)
          wopr =
            s.stats.wopr ??
            (targetShare !== null && airYardsShare !== null
              ? 1.5 * targetShare + 0.7 * airYardsShare
              : null)
        }
      }
      weeks.push({
        week,
        opponent: scheduled ? toSleeperTeam(scheduled) : (projection?.opponent ?? null),
        played: pts !== undefined,
        points: pts ?? null,
        projected: projection && rules ? scoreStatLine(projection.stats, rules, position) : null,
        line,
        snapPct: playerSnaps?.get(week)?.offensePct ?? null,
        targetShare,
        rushShare,
        airYardsShare,
        wopr
      })
    }
    return {
      base,
      statsAvailable: r.gsis_id !== null || r.nflverse_team !== null,
      rosterSlot: r.owner_slot,
      weeks
    }
  })

  const sleeperSchedule = new Map<string, Map<number, string>>()
  for (const [team, weeks] of schedule) {
    sleeperSchedule.set(
      toSleeperTeam(team),
      new Map([...weeks].map(([week, opponent]) => [week, toSleeperTeam(opponent)]))
    )
  }

  return {
    season,
    currentWeek,
    projectionsStored: projectionRows.length > 0,
    teamCount: league?.totalRosters ?? 0,
    hasMyTeam: listTeams(db, leagueId).some((t) => t.isMe),
    rules,
    schedule: sleeperSchedule,
    players
  }
}
