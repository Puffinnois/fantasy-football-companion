import {
  offensiveYards,
  playerStatLine,
  teamStatLine,
  withDisplayStats,
  withKickingBuckets
} from '@main/scoring/adapters'
import { scoreStatLine, type StatLine } from '@main/scoring/engine'
import { pointsAllowedIndex } from '@main/scoring/recompute'
import { asPosition, FLEX_ELIGIBILITY, LINEUP_POSITIONS, type RosterSlotCount } from '@shared/rules'
import { toNflverseTeam, toSleeperTeam } from '@shared/teams'
import { kickoffIso } from '@shared/time'
import type {
  GameInfo,
  PlayerBaseRow,
  PlayersOptions,
  PlayersWeek,
  PlayerWeekRow,
  PositionTab,
  RosterSlot
} from '@shared/types'
import type { Db } from '../connection'
import { getLeague } from './leagues'
import { latestPointsWeek, listPointsByWeek, round2 } from './points'
import { listProjections, listProjectionWeeks } from './projections'
import { getRules } from './rules'
import { getNflState } from './state'
import {
  listGamesByWeek,
  listPlayerWeeksByWeek,
  listSnapsByWeek,
  listTeamWeeksByWeek,
  teamByeWeeks
} from './stats'

export interface CandidateRow {
  player_id: string
  full_name: string
  pos: string | null
  team: string | null
  injury_status: string | null
  years_exp: number | null
  owner_roster_id: number | null
  owner_name: string | null
  /** null for free agents. */
  owner_slot: RosterSlot | null
  /** teams.is_me of the owner; null for free agents. */
  owner_is_me: number | null
  watched: string | null
  gsis_id: string | null
  pfr_id: string | null
  nflverse_team: string | null
}

/** ALL, one tab per scored position, then the league's flex slots in roster order. */
export function tabsForSlots(slots: RosterSlotCount[]): PositionTab[] {
  const tabs: PositionTab[] = [{ id: 'ALL', label: 'All', positions: [...LINEUP_POSITIONS] }]
  for (const p of LINEUP_POSITIONS) tabs.push({ id: p, label: p, positions: [p] })
  for (const s of slots) {
    const positions = FLEX_ELIGIBILITY[s.slot]
    if (positions && !tabs.some((t) => t.id === s.slot)) {
      tabs.push({ id: s.slot, label: s.slot.replace('_', ' '), positions: [...positions] })
    }
  }
  return tabs
}

/**
 * Every candidate player of the league: scored positions that are rostered, watched, or active on
 * an NFL team, with the owner, watchlist and nflverse identity joined in.
 */
export function listCandidates(db: Db, leagueId: string): CandidateRow[] {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT p.player_id, p.full_name, CASE WHEN p.position = 'FB' THEN 'RB' ELSE p.position END AS pos,
           p.team, p.status, p.injury_status, p.years_exp,
           rp.roster_id AS owner_roster_id, rp.slot AS owner_slot, t.is_me AS owner_is_me,
           COALESCE(t.team_name, t.display_name) AS owner_name,
           w.player_id AS watched, i.gsis_id, i.pfr_id, i.nflverse_team
         FROM players p
         LEFT JOIN roster_players rp ON rp.player_id = p.player_id AND rp.league_id = ?
         LEFT JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
         LEFT JOIN watchlist w ON w.player_id = p.player_id
         LEFT JOIN player_ids i ON i.player_id = p.player_id
       ) WHERE pos IN (${LINEUP_POSITIONS.map(() => '?').join(', ')})
         AND (owner_roster_id IS NOT NULL OR watched IS NOT NULL
              OR (team IS NOT NULL AND COALESCE(status, '') != 'Inactive'))`
    )
    .all(leagueId, ...LINEUP_POSITIONS) as unknown as CandidateRow[]
}

/** The fields every row type shares; `byes` is `teamByeWeeks` keyed by nflverse team. */
export function baseRow(r: CandidateRow, byes: Map<string, number>): PlayerBaseRow {
  const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
  return {
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.pos,
    team: r.team,
    byeWeek: nflverseTeam ? (byes.get(nflverseTeam) ?? null) : null,
    injuryStatus: r.injury_status,
    rookie: r.years_exp === 0,
    watched: r.watched !== null,
    ownerRosterId: r.owner_roster_id,
    ownerName: r.owner_name,
    ownerIsMe: r.owner_is_me === 1
  }
}

export function playersOptions(db: Db, leagueId: string): PlayersOptions {
  const league = getLeague(db, leagueId)
  const state = getNflState(db)
  const season = league ? Number(league.season) : state ? Number(state.season) : 0
  return {
    seasons: [season, season - 1],
    currentWeek: state ? Math.min(Math.max(state.displayWeek, 1), 18) : 1,
    lastScoredWeek: latestPointsWeek(db, leagueId, season),
    tabs: tabsForSlots(getRules(db, leagueId)?.rosterSlots ?? []),
    projectionWeeks: listProjectionWeeks(db)
  }
}

/**
 * Every candidate player (scored positions that are rostered, watched, or active on an NFL team)
 * with one week of data attached from map lookups: actual line, points, projection, snaps, game.
 * Filtering and sorting happen in the renderer.
 */
export function playersWeek(db: Db, leagueId: string, season: number, week: number): PlayersWeek {
  const rules = getRules(db, leagueId)
  const candidates = listCandidates(db, leagueId)

  const statsByGsis = new Map(listPlayerWeeksByWeek(db, season, week).map((r) => [r.gsisId, r]))
  const teamWeeks = listTeamWeeksByWeek(db, season, week)
  const teamByCode = new Map(teamWeeks.map((t) => [t.team, t]))
  const games = listGamesByWeek(db, season, week)
  const allowed = pointsAllowedIndex(games)
  const gameByTeam = new Map<string, GameInfo>()
  for (const g of games) {
    const shared = {
      kickoff: kickoffIso(g.gameday, g.gametime),
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      final: g.homeScore !== null && g.awayScore !== null
    }
    gameByTeam.set(g.homeTeam, { ...shared, opponent: toSleeperTeam(g.awayTeam), home: true })
    gameByTeam.set(g.awayTeam, { ...shared, opponent: toSleeperTeam(g.homeTeam), home: false })
  }
  const points = listPointsByWeek(db, leagueId, season, week)
  const projections = new Map(listProjections(db, season, week).map((p) => [p.playerId, p.stats]))
  const snaps = listSnapsByWeek(db, season, week)
  const byes = teamByeWeeks(db, season)

  const rows: PlayerWeekRow[] = candidates.map((r) => {
    const position = asPosition(r.pos)
    const projLine = projections.get(r.player_id) ?? null
    const projected = projLine && rules ? scoreStatLine(projLine, rules, position) : null
    let actual: StatLine | null = null
    let targetShare: number | null = null
    let snapPct: number | null = null
    if (r.nflverse_team) {
      const t = teamByCode.get(r.nflverse_team)
      if (t) {
        const opp = t.opponent ? teamByCode.get(t.opponent) : undefined
        actual = teamStatLine(t.stats, {
          pointsAllowed: allowed.get(`${t.team}|${season}|${week}`) ?? null,
          yardsAllowed: opp ? offensiveYards(opp.stats) : null
        })
      }
    } else if (r.gsis_id) {
      const s = statsByGsis.get(r.gsis_id)
      if (s) {
        actual = withDisplayStats(playerStatLine(s.stats), s.stats)
        targetShare = s.stats.target_share ?? null
      }
      if (r.pfr_id) snapPct = snaps.get(r.pfr_id) ?? null
    }
    const pts = points.get(r.player_id) ?? null
    const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
    return {
      ...baseRow(r, byes),
      game: nflverseTeam ? (gameByTeam.get(nflverseTeam) ?? null) : null,
      points: pts,
      projected,
      delta: pts !== null && projected !== null ? round2(pts - projected) : null,
      actual: actual ? (withKickingBuckets(actual) as Record<string, number>) : {},
      projection: projLine ? (withKickingBuckets(projLine) as Record<string, number>) : null,
      snapPct,
      targetShare,
      statsAvailable: r.gsis_id !== null || r.nflverse_team !== null
    }
  })
  return { rows }
}
