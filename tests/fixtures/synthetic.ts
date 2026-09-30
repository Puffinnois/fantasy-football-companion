import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { replaceExpertRanks, ROS_WEEK } from '@main/db/repos/expertRanks'
import { upsertLeague } from '@main/db/repos/leagues'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listMatchups } from '@main/db/repos/matchups'
import { upsertPlayers, type PlayerRecord } from '@main/db/repos/players'
import { replacePoints } from '@main/db/repos/points'
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
  /** Sleeper injury status (e.g. 'Out'); omitted = healthy. */
  injuryStatus?: string
  /** NFL team; free agents need one to be in the candidate pool, so they default to 'KC'. */
  team?: string
  /** FantasyPros ROS consensus (seeded as overall and positional rank); omitted = unranked. */
  rank?: number
  /** Points already scored in the league's current week — his game that week is played. */
  points?: number
}

export interface SyntheticTeam {
  rosterId: number
  name: string
  isMe?: boolean
  waiverPosition?: number
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
  /** Slice 6c: players on no roster — the value pool's free agents. */
  freeAgents?: SyntheticPlayer[]
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

/**
 * Slice 6c engine fixture: slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 16–17.
 * My optimal lineup is 42 a week (RB A20 · WR B10 · FLEX C12); D never starts.
 *
 * | Me (1)        | Rival (2)  | Free agents (team KC)            |
 * | ------------- | ---------- | -------------------------------- |
 * | A RB 20 5000  | R1 WR 30   | X WR 11 (800)                    |
 * | C RB 12 2000  | R2 RB 30   | Y RB 3 in wk 16, 25 in wk 17     |
 * | B WR 10 1500  |            | Z WR 4 (700)                     |
 * | D WR 5 300    |            | K TE 9 (900)                     |
 * |               |            | W RB 2, ROS rank 5               |
 * |               |            | Q QB 30 (no QB slot, no signal)  |
 *
 * By hand (Δ over the two weeks, options best first):
 *   X → drop D +2 · drop B +2 · drop C −2 · drop A −18   (starts 16, 17; this week +1)
 *   Y → drop D +13 · drop C +6 · drop B +3 · drop A −10  (starts 17; this week 0 / −7 / −5 / −15)
 *   Z, K, W, Q can't start for me in either week → skipped by the lineup search.
 *   Stash in market order: K [D 0 · C −6 · B −10 · A −22], Z [D 0 · B −10 · C −14 · A −30],
 *   W [D 0 · B −10 · C −14 · A −30].
 */
export const WAIVER_LEAGUE: SyntheticLeague = {
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
    settings: { numTeams: 2, waiverType: 'priority', playoffStartWeek: 15, playoffTeams: 6 }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      waiverPosition: 2,
      players: [
        { id: 'A', position: 'RB', weekly: 20, market: 5000 },
        { id: 'C', position: 'RB', weekly: 12, market: 2000 },
        { id: 'B', position: 'WR', weekly: 10, market: 1500 },
        { id: 'D', position: 'WR', weekly: 5, market: 300 }
      ]
    },
    {
      rosterId: 2,
      name: 'Rival',
      waiverPosition: 1,
      players: [
        { id: 'R1', position: 'WR', weekly: 30 },
        { id: 'R2', position: 'RB', weekly: 30 }
      ]
    }
  ],
  freeAgents: [
    { id: 'X', position: 'WR', weekly: 11, market: 800 },
    { id: 'Y', position: 'RB', weekly: [3, 25] },
    { id: 'Z', position: 'WR', weekly: 4, market: 700 },
    { id: 'K', position: 'TE', weekly: 9, market: 900 },
    { id: 'W', position: 'RB', weekly: 2, rank: 5 },
    { id: 'Q', position: 'QB', weekly: 30 }
  ]
}

/** `WAIVER_LEAGUE` with my roster replaced — the release variants of the engine tests. */
export function waiverLeagueWith(mine: SyntheticPlayer[]): SyntheticLeague {
  return {
    ...WAIVER_LEAGUE,
    teams: WAIVER_LEAGUE.teams.map((t) => (t.isMe ? { ...t, players: mine } : t))
  }
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
    isMe: t.isMe ?? false,
    waiverPosition: t.waiverPosition ?? null
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
    team: p.team ?? null,
    status: 'Active',
    injuryStatus: p.injuryStatus ?? null,
    injuryBodyPart: null,
    injuryNotes: null,
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
export function syntheticBuild(
  league: SyntheticLeague,
  path = ':memory:'
): { db: Db; build: LineupBuild } {
  const db = openDatabase(path)
  migrate(db)
  const leagueRules = league.rules ?? rules()
  // The roster positions must reach the DB too: anything that rebuilds from it (the search worker)
  // reads them back out of `sleeper_raw`.
  upsertLeague(
    db,
    mapLeague({ ...fx.league, roster_positions: league.rosterPositions }, SEED_TS),
    SEED_TS
  )
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
  const freeAgents = (league.freeAgents ?? []).map((p) => ({ ...p, team: p.team ?? 'KC' }))
  const players = [...league.teams.flatMap((t) => t.players), ...freeAgents]
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
  const scored = players.filter((p) => typeof p.points === 'number')
  replacePoints(
    db,
    'L1',
    scored.map((p) => ({
      playerId: p.id,
      season: SEASON,
      week: league.currentWeek,
      points: p.points as number
    })),
    SEED_TS
  )
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
  const ranked = players.filter((p) => typeof p.rank === 'number')
  replaceExpertRanks(
    db,
    SEASON,
    ROS_WEEK,
    'PPR',
    ranked.map((p) => ({
      playerId: p.id,
      rankEcr: p.rank as number,
      posRank: p.rank as number,
      rankAve: null,
      rankStd: null,
      rankMin: null,
      rankMax: null,
      experts: 10,
      grade: null,
      projPts: null
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
 * FantasyCalc value for players in the upper half of their position's range; plus `freeAgents`
 * unrostered players from the lower 60 % of each range.
 */
export function generateLeague(seed: number, teamCount = 16, freeAgents = 0): SyntheticLeague {
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
  // Slice 6c: the leftovers — drawn from the lower 60 % of each position's range.
  const pool = Array.from({ length: freeAgents }, (_, i): SyntheticPlayer => {
    const position = SHAPE[i % SHAPE.length]
    const [lo, hi] = RANGES[position]
    const mean = lo + (hi - lo) * 0.6 * r()
    return {
      id: `fa${i + 1}`,
      position,
      team: 'KC',
      weekly: weeks.map(() => Math.round(mean * (0.7 + 0.6 * r()) * 10) / 10),
      market: null
    }
  })
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
    teams,
    freeAgents: pool
  }
}
