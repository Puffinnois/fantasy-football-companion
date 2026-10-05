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
 * Multi-team spec §2.2: a three-way cycle where everyone gains. Slots RB · WR · TE (+1 bench),
 * roster size 4, window weeks 16–17; every player is worth 1000 on the market.
 *
 * | Me (1)     | Two (2)    | Three (3)  |
 * | ---------- | ---------- | ---------- |
 * | a1 RB 20   | b1 WR 20   | c1 TE 20   |
 * | a2 RB 15   | b2 WR 15   | c2 TE 14   |
 * | a3 WR 5    | b3 TE 4    | c3 RB 5    |
 * | a4 TE 10   | b4 RB 10   | c4 WR 10   |
 *
 * Optimal per week: Me 35, Two 34, Three 35. a2 → Three, c2 → Two, b2 → Me gives Me 45 (a1 · b2 ·
 * a4), Three 45 (a2 · c4 · c1), Two 44 (b4 · b1 · c2): +10 a week for everyone.
 */
export const CYCLE_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'TE', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'TE', count: 1 },
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
        { id: 'a1', position: 'RB', weekly: 20, market: 1000 },
        { id: 'a2', position: 'RB', weekly: 15, market: 1000 },
        { id: 'a3', position: 'WR', weekly: 5, market: 1000 },
        { id: 'a4', position: 'TE', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'b1', position: 'WR', weekly: 20, market: 1000 },
        { id: 'b2', position: 'WR', weekly: 15, market: 1000 },
        { id: 'b3', position: 'TE', weekly: 4, market: 1000 },
        { id: 'b4', position: 'RB', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 3,
      name: 'Three',
      players: [
        { id: 'c1', position: 'TE', weekly: 20, market: 1000 },
        { id: 'c2', position: 'TE', weekly: 14, market: 1000 },
        { id: 'c3', position: 'RB', weekly: 5, market: 1000 },
        { id: 'c4', position: 'WR', weekly: 10, market: 1000 }
      ]
    }
  ]
}

/**
 * Multi-team spec §3: a deal only three teams can make. Slots RB · WR · TE (+1 bench), roster
 * size 4, window weeks 16–17. Optimal per week: Me 35 (a1 · a3 · a4), Two 42 (b4 · b1 · b3),
 * Three 43 (c3 · c4 · c1).
 *
 * | Me (1)        | Two (2)       | Three (3)     |
 * | ------------- | ------------- | ------------- |
 * | a1 RB 20 4000 | b1 WR 20 4000 | c1 TE 20 4000 |
 * | a2 RB 15 1000 | b2 WR 15 3000 | c2 TE 14 1000 |
 * | a3 WR 5 300   | b3 TE 4 200   | c3 RB 5 300   |
 * | a4 TE 10 1500 | b4 RB 18 3500 | c4 WR 18 3000 |
 *
 * a2 for b2 fails with Two: a2 can't start behind b4, and 1 000 for 3 000 is not market-fair.
 * Through Three it works — a2 → Three, c2 → Two, b2 → me, everyone +10 a week. Three could also
 * send c1 (Three +4, Two +16), c2 + c3 (+10 / +10, Two drops b3) or c1 + c3 (+4 / +16, Two drops b3).
 */
export const TRIANGLE_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'TE', 'BN'],
  rules: CYCLE_LEAGUE.rules,
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'a1', position: 'RB', weekly: 20, market: 4000 },
        { id: 'a2', position: 'RB', weekly: 15, market: 1000 },
        { id: 'a3', position: 'WR', weekly: 5, market: 300 },
        { id: 'a4', position: 'TE', weekly: 10, market: 1500 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'b1', position: 'WR', weekly: 20, market: 4000 },
        { id: 'b2', position: 'WR', weekly: 15, market: 3000 },
        { id: 'b3', position: 'TE', weekly: 4, market: 200 },
        { id: 'b4', position: 'RB', weekly: 18, market: 3500 }
      ]
    },
    {
      rosterId: 3,
      name: 'Three',
      players: [
        { id: 'c1', position: 'TE', weekly: 20, market: 4000 },
        { id: 'c2', position: 'TE', weekly: 14, market: 1000 },
        { id: 'c3', position: 'RB', weekly: 5, market: 300 },
        { id: 'c4', position: 'WR', weekly: 18, market: 3000 }
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

/**
 * Multi-team spec §7 property-test league: `generateLeague(seed, 4)` cut to 2 RB + 2 WR per team,
 * slots RB · WR · FLEX (+1 bench) so every 2-for-1 forces a drop, window weeks 3–5. Small enough
 * for the brute force to enumerate every 4-team cycle. `teamCount` 5 lets a test reach a 5-team deal.
 */
export function searchLeague(seed: number, teamCount = 4): SyntheticLeague {
  const g = generateLeague(seed, teamCount)
  return {
    ...g,
    weeks: g.weeks.slice(0, 3),
    rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
    rules: rules({
      rosterSlots: [
        { slot: 'RB', count: 1 },
        { slot: 'WR', count: 1 },
        { slot: 'FLEX', count: 1 },
        { slot: 'BN', count: 1 }
      ],
      settings: { numTeams: teamCount, waiverType: 'faab', playoffStartWeek: 4, playoffTeams: 4 }
    }),
    teams: g.teams.map((t) => ({
      ...t,
      players: [t.players[2], t.players[3], t.players[7], t.players[8]].map((p) => ({
        ...p,
        weekly: Array.isArray(p.weekly) ? p.weekly.slice(0, 3) : p.weekly
      }))
    }))
  }
}

/**
 * `searchLeague` with negative values in the current week (3) on teams 1 and 3: each one's second
 * RB and second WR are at −2, so every lineup there forces a negative player into FLEX and the
 * optimum stops being monotone in the roster. Teams 2 and 4 stay positive, so prunes stay on for
 * deals that touch no negative player.
 */
export function negativeSearchLeague(seed: number): SyntheticLeague {
  const league = searchLeague(seed)
  return {
    ...league,
    teams: league.teams.map((t) =>
      t.rosterId !== 1 && t.rosterId !== 3
        ? t
        : {
            ...t,
            players: t.players.map((p, i) =>
              (i === 1 || i === 3) && Array.isArray(p.weekly)
                ? { ...p, weekly: [-2, ...p.weekly.slice(1)] }
                : p
            )
          }
    )
  }
}

/**
 * Four teams, slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 3–5, built so that a
 * bigger roster totals less: Me and Two each hold two players at −2 in the current week (3) and
 * 0.5 after it, and with nobody better for FLEX the lineup solver is forced to start one of them
 * there. Giving both away leaves FLEX empty, which is worth more than the forced −2 that week.
 * Every prune that assumes "more players never total less" is wrong somewhere in here; the
 * `SearchContext.slack` guards keep them exact.
 *
 * | Me (1)             | Two (2)            | Three (3)         | Four (4)            |
 * | ------------------ | ------------------ | ----------------- | ------------------- |
 * | n1 RB −2 .5 .5 100 | m1 RB −2 .5 .5 100 | j QB 5 40         | z WR out 1.5 1000   |
 * | n2 WR −2 .5 .5 100 | m2 WR −2 .5 .5 100 | c1 RB 12 1500     | f1 RB 8 800         |
 * | a1 RB 10 1000      | b1 RB 10 1000      | c2 WR 12 1500     | f2 WR 8 800         |
 * | a2 WR 10 1000      | b2 WR 10 1000      | c3 WR 3 300       | f3 RB 2 200         |
 *
 * (weekly points in weeks 3 · 4 · 5, then the FantasyCalc value; "out" = Out in week 3.)
 * - Two takes j (a QB, who can never start) for m1 + m2: week 3 gains 2, weeks 4–5 lose 0.5 each,
 *   so +1 — yet m1 for j and m2 for j are both Δ 0 and refused on the market. Me → Three → Two → Me
 *   (a1, j, m1 + m2) is the one deal that needs both of the bridge prunes switched off.
 * - I get z (Out in week 3, 1.5 after) for n1 + n2: +4 over the window, 1.33 a week — a premium
 *   deal — while z alone adds only 2 (0.67 a week) and n1 for z only 2 as well.
 */
export const NEGATIVE_LEAGUE: SyntheticLeague = {
  currentWeek: 3,
  weeks: [3, 4, 5],
  rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'BN', count: 1 }
    ],
    settings: { numTeams: 4, waiverType: 'faab', playoffStartWeek: 4, playoffTeams: 4 }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'n1', position: 'RB', weekly: [-2, 0.5, 0.5], market: 100 },
        { id: 'n2', position: 'WR', weekly: [-2, 0.5, 0.5], market: 100 },
        { id: 'a1', position: 'RB', weekly: 10, market: 1000 },
        { id: 'a2', position: 'WR', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'm1', position: 'RB', weekly: [-2, 0.5, 0.5], market: 100 },
        { id: 'm2', position: 'WR', weekly: [-2, 0.5, 0.5], market: 100 },
        { id: 'b1', position: 'RB', weekly: 10, market: 1000 },
        { id: 'b2', position: 'WR', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 3,
      name: 'Three',
      players: [
        { id: 'j', position: 'QB', weekly: 5, market: 40 },
        { id: 'c1', position: 'RB', weekly: 12, market: 1500 },
        { id: 'c2', position: 'WR', weekly: 12, market: 1500 },
        { id: 'c3', position: 'WR', weekly: 3, market: 300 }
      ]
    },
    {
      rosterId: 4,
      name: 'Four',
      players: [
        { id: 'z', position: 'WR', weekly: 1.5, market: 1000, injuryStatus: 'Out' },
        { id: 'f1', position: 'RB', weekly: 8, market: 800 },
        { id: 'f2', position: 'WR', weekly: 8, market: 800 },
        { id: 'f3', position: 'RB', weekly: 2, market: 200 }
      ]
    }
  ]
}

/**
 * Slots RB · RB (+2 bench), roster size 4, window weeks 3–5, and Two already one over the limit —
 * five players, as when one comes back from IR — so every swap of one for one forces a drop.
 * Only RBs, so a week's lineup is its two best.
 *
 * | Me (1)      | Two (2)         |
 * | ----------- | --------------- |
 * | h1 RB 3 8 5 | t1 RB 1 1 6     |
 * | h2 RB 8 4 1 | t2 RB 4 8 8     |
 * |             | t3 RB 9 4 4     |
 * |             | t4 RB 1 4 7     |
 * |             | t5 RB 7 5 2     |
 *
 * (weekly points in weeks 3 · 4 · 5; every player is worth 1000 on the market but t1, 3000.)
 * Two gives t1 (a bench player: giving it alone is Δ 0) for h1 + h2 and gains 2: it drops t4 and
 * t5 and starts h2 · t3, t2 · h1, t2 · h1. Each single is dragged down by its own drop (both drop
 * t4, who starts once like three others and has the fewest ROS points): h1 alone is +1 (+3 before
 * the drop), h2 alone −2 (+1 before it). The submodular bound over those two, 1 − 2 − 0 = −1, is
 * below the pair's real +2 — it holds only where the singles need no drop.
 */
export const OVERFULL_LEAGUE: SyntheticLeague = {
  currentWeek: 3,
  weeks: [3, 4, 5],
  rosterPositions: ['RB', 'RB', 'BN', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 2 },
      { slot: 'BN', count: 2 }
    ],
    settings: { numTeams: 2, waiverType: 'faab', playoffStartWeek: 4, playoffTeams: 4 }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'h1', position: 'RB', weekly: [3, 8, 5], market: 1000 },
        { id: 'h2', position: 'RB', weekly: [8, 4, 1], market: 1000 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 't1', position: 'RB', weekly: [1, 1, 6], market: 3000 },
        { id: 't2', position: 'RB', weekly: [4, 8, 8], market: 1000 },
        { id: 't3', position: 'RB', weekly: [9, 4, 4], market: 1000 },
        { id: 't4', position: 'RB', weekly: [1, 4, 7], market: 1000 },
        { id: 't5', position: 'RB', weekly: [7, 5, 2], market: 1000 }
      ]
    }
  ]
}

/**
 * Slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 3–5, built so that two received
 * players cost less together than apart: Two's lineup leaves FLEX empty (its QBs can never
 * start), so each of n1 and n2 alone is forced into it — −4 in week 3, 1 after — while both
 * together still fill only the one slot.
 *
 * | Me (1)       | Two (2)     |
 * | ------------ | ----------- |
 * | n1 RB −4 1 1 | r RB 10     |
 * | n2 WR −4 1 1 | w WR 10     |
 * |              | q1 QB 5     |
 * |              | q2 QB 5     |
 *
 * (weekly points in weeks 3 · 4 · 5; every player is worth 1000 on the market but q1, 2000.)
 * Two gives q1 for n1 + n2: −2 for the window (−0.67 a week) at a market ratio of 1.0, so it
 * takes the deal. Each single is −2 too and giving q1 alone is 0, so the submodular bound,
 * −2 − 2 − 0 = −4, would refuse it — it needs a roster with nothing below zero.
 */
export const FORCED_PAIR_LEAGUE: SyntheticLeague = {
  currentWeek: 3,
  weeks: [3, 4, 5],
  rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'BN', count: 1 }
    ],
    settings: { numTeams: 2, waiverType: 'faab', playoffStartWeek: 4, playoffTeams: 4 }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'n1', position: 'RB', weekly: [-4, 1, 1], market: 1000 },
        { id: 'n2', position: 'WR', weekly: [-4, 1, 1], market: 1000 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'r', position: 'RB', weekly: 10, market: 1000 },
        { id: 'w', position: 'WR', weekly: 10, market: 1000 },
        { id: 'q1', position: 'QB', weekly: 5, market: 2000 },
        { id: 'q2', position: 'QB', weekly: 5, market: 1000 }
      ]
    }
  ]
}
