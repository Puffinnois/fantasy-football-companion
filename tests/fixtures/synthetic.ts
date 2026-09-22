import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listMatchups } from '@main/db/repos/matchups'
import { upsertPlayers, type PlayerRecord } from '@main/db/repos/players'
import { replaceProjections } from '@main/db/repos/projections'
import { saveRules } from '@main/db/repos/rules'
import { SETTING_ACTIVE_LEAGUE, SETTING_MY_USER, setSetting } from '@main/db/repos/settings'
import { setNflState } from '@main/db/repos/state'
import {
  listStarterIndexes,
  listTeams,
  replaceRosterPlayers,
  replaceTeams
} from '@main/db/repos/teams'
import { buildLineups, type LineupBuild } from '@main/lineup/build'
import { mapLeague } from '@main/sync/mappers'
import { buildValueSeason } from '@main/value/build'
import type { Rules } from '@shared/rules'
import type { RosterSlot, Team } from '@shared/types'
import { SEED_TS } from './db'
import { rules } from './rules'
import { SEASON } from './season'
import * as fx from './sleeper'

export interface SyntheticPlayer {
  id: string
  position: string
  /** Projected points per window week (one number = the same every week). */
  weekly: number | number[]
  slot?: RosterSlot
  /** FantasyCalc value; omitted / null = outside its list. */
  market?: number | null
}

export interface SyntheticTeam {
  rosterId: number
  name: string
  isMe?: boolean
  players: SyntheticPlayer[]
}

export interface SyntheticLeague {
  currentWeek: number
  /** Weeks that get a projection row; the window is currentWeek..lastWeek from `rules.settings`. */
  weeks: number[]
  /** Sleeper `roster_positions`; IR / TAXI do not count towards the roster size. */
  rosterPositions: string[]
  rules?: Rules
  teams: SyntheticTeam[]
}

/**
 * Three teams, slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 16–17 (two weeks,
 * constant values, so `delta = 2 × weekly Δ` and `deltaPerWeek = weekly Δ`). Everyone below is
 * FantasyCalc-valued. Optimal per week: Me 46 (A, B, C), Rival 43 (G, F, E), Other 38 (J, I, L).
 *
 * | Me (1)        | Rival (2)     | Other (3)     |
 * | ------------- | ------------- | ------------- |
 * | A RB 20 5000  | F WR 19 4400  | I WR 25 7000  |
 * | C RB 18 4000  | E WR 17 3800  | J RB 4 500    |
 * | B WR 8 1500   | G RB 7 1000   | K WR 6 900    |
 * | D WR 5 300    | H RB 3 100    | L TE 9 1200   |
 *
 * Players who can enter my lineup (RB A20 · WR B8 · FLEX C18): F, E (Rival) and I (Other).
 * Expected offers, computed by hand in the Plan M document:
 *   fair / premium → A+B→I (me +4, them −2, drop J, market) · C→F (me +2, them −2, market)
 *   overpay        → the two above, then C→E (me −2, ratio 0.95, both) · A→F (me −2, ratio 0.88, both)
 *   C+D→F, A+D→F, C+D→E pass but are dominated by C→F / A→F / C→E; every 1-for-2 fails on their side.
 */
export const SMALL_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'BN', count: 1 }
    ],
    settings: {
      numTeams: 3,
      waiverType: 'faab',
      tradeDeadlineWeek: 17,
      playoffStartWeek: 15,
      playoffTeams: 6
    }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'A', position: 'RB', weekly: 20, market: 5000 },
        { id: 'C', position: 'RB', weekly: 18, market: 4000 },
        { id: 'B', position: 'WR', weekly: 8, market: 1500 },
        { id: 'D', position: 'WR', weekly: 5, market: 300 }
      ]
    },
    {
      rosterId: 2,
      name: 'Rival',
      players: [
        { id: 'F', position: 'WR', weekly: 19, market: 4400 },
        { id: 'E', position: 'WR', weekly: 17, market: 3800 },
        { id: 'G', position: 'RB', weekly: 7, market: 1000 },
        { id: 'H', position: 'RB', weekly: 3, market: 100 }
      ]
    },
    {
      rosterId: 3,
      name: 'Other',
      players: [
        { id: 'I', position: 'WR', weekly: 25, market: 7000 },
        { id: 'J', position: 'RB', weekly: 4, market: 500 },
        { id: 'K', position: 'WR', weekly: 6, market: 900 },
        { id: 'L', position: 'TE', weekly: 9, market: 1200 }
      ]
    }
  ]
}

function team(t: SyntheticTeam): Team {
  return {
    leagueId: 'L1',
    rosterId: t.rosterId,
    ownerId: `u${t.rosterId}`,
    displayName: t.name,
    teamName: null,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    isMe: t.isMe ?? false
  }
}

function playerRecord(p: SyntheticPlayer): PlayerRecord {
  return {
    playerId: p.id,
    fullName: p.id,
    firstName: null,
    lastName: null,
    position: p.position,
    fantasyPositions: [p.position],
    team: null,
    status: 'Active',
    injuryStatus: null,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    sportradarId: null,
    espnId: null
  }
}

/** Seeds an in-memory DB with the league as of `currentWeek` and builds the lineups on it, as `cachedLineup` does. */
export function syntheticBuild(league: SyntheticLeague): { db: Db; build: LineupBuild } {
  const db = openDatabase(':memory:')
  migrate(db)
  const leagueRules = league.rules ?? rules()
  upsertLeague(db, mapLeague(fx.league, SEED_TS), SEED_TS)
  saveRules(db, 'L1', leagueRules)
  setSetting(db, SETTING_ACTIVE_LEAGUE, 'L1')
  setSetting(db, SETTING_MY_USER, 'u1')
  setNflState(db, {
    season: String(SEASON),
    week: league.currentWeek,
    displayWeek: league.currentWeek,
    seasonType: 'regular',
    fetchedAt: SEED_TS
  })
  replaceTeams(db, 'L1', league.teams.map(team), SEED_TS)
  replaceRosterPlayers(
    db,
    'L1',
    league.teams.flatMap((t) =>
      t.players.map((p) => ({
        rosterId: t.rosterId,
        playerId: p.id,
        slot: p.slot ?? 'bench',
        starterIndex: null
      }))
    ),
    SEED_TS
  )
  const players = league.teams.flatMap((t) => t.players)
  upsertPlayers(db, players.map(playerRecord), SEED_TS)
  league.weeks.forEach((week, i) => {
    replaceProjections(
      db,
      SEASON,
      week,
      players.map((p) => ({
        playerId: p.id,
        season: SEASON,
        week,
        company: 'rotowire',
        team: null,
        opponent: 'OPP',
        stats: { rec: Array.isArray(p.weekly) ? p.weekly[i] : p.weekly }
      })),
      SEED_TS
    )
  })
  const valued = players.filter((p) => typeof p.market === 'number')
  replaceMarketValues(
    db,
    SEASON,
    valued.map((p, i) => ({
      playerId: p.id,
      value: p.market as number,
      overallRank: i + 1,
      posRank: i + 1,
      tier: null,
      trend30d: 0
    })),
    SEED_TS
  )
  const build = buildLineups({
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: leagueRules.rosterSlots,
    rosterPositions: league.rosterPositions,
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    tradeDeadlineWeek: leagueRules.settings.tradeDeadlineWeek ?? null
  })
  return { db, build }
}

/** Small deterministic generator so a failing case reproduces from its seed. */
export function rng(seed: number): () => number {
  let s = seed
  return (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const SHAPE = [
  'QB',
  'QB',
  'RB',
  'RB',
  'RB',
  'RB',
  'RB',
  'WR',
  'WR',
  'WR',
  'WR',
  'WR',
  'TE',
  'TE',
  'K',
  'DEF'
]
const RANGES: Record<string, [number, number]> = {
  QB: [12, 24],
  RB: [3, 20],
  WR: [3, 20],
  TE: [2, 12],
  K: [6, 10],
  DEF: [4, 10]
}

/**
 * Spec 6b §6 budget league: `teamCount` teams × 16 players (2 QB, 5 RB, 5 WR, 2 TE, K, DEF), the
 * default 12-team PPR slots, a 16-spot roster, window weeks 3–17 with ±30 % weekly jitter, and a
 * FantasyCalc value for players in the upper half of their position's range.
 */
export function generateLeague(seed: number, teamCount = 16): SyntheticLeague {
  const r = rng(seed)
  const currentWeek = 3
  const weeks = Array.from({ length: 15 }, (_, i) => currentWeek + i)
  let n = 0
  const teams = Array.from({ length: teamCount }, (_, t): SyntheticTeam => ({
    rosterId: t + 1,
    name: `Team ${t + 1}`,
    isMe: t === 0,
    players: SHAPE.map((position): SyntheticPlayer => {
      const [lo, hi] = RANGES[position]
      const mean = lo + (hi - lo) * r()
      n++
      return {
        id: `p${n}`,
        position,
        weekly: weeks.map(() => Math.round(mean * (0.7 + 0.6 * r()) * 10) / 10),
        market: mean >= (lo + hi) / 2 ? Math.round(mean * 400 * (0.8 + 0.4 * r())) : null
      }
    })
  }))
  return {
    currentWeek,
    weeks,
    rosterPositions: [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN'
    ],
    teams
  }
}
