import { describe, expect, it } from 'vitest'
import {
  defenseRanks,
  lastScheduledWeek,
  playerSchedule,
  type TeamSchedule
} from '@main/value/schedule'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'

const played = (week: number, opponent: string, points: number): SeriesWeek => ({
  week,
  opponent,
  played: true,
  points,
  projected: null,
  line: {},
  snapPct: null,
  targetShare: null,
  rushShare: null,
  airYardsShare: null,
  wopr: null
})
const player = (
  id: string,
  position: string | null,
  team: string | null,
  weeks: SeriesWeek[]
): PlayerSeries => ({
  base: {
    playerId: id,
    fullName: id,
    position,
    team,
    byeWeek: null,
    injuryStatus: null,
    rookie: false,
    watched: false,
    ownerRosterId: null,
    ownerName: null
  },
  statsAvailable: true,
  weeks
})

// Four teams; A's season: B, C, D, B, bye, C. Week 6 is the last scheduled week.
const schedule: TeamSchedule = new Map([
  [
    'A',
    new Map([
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
      [4, 'B'],
      [6, 'C']
    ])
  ],
  [
    'B',
    new Map([
      [1, 'A'],
      [4, 'A']
    ])
  ],
  [
    'C',
    new Map([
      [1, 'D'],
      [2, 'A'],
      [6, 'A']
    ])
  ],
  [
    'D',
    new Map([
      [1, 'C'],
      [3, 'A']
    ])
  ]
])
const players = [
  player('rb1', 'RB', 'A', [played(1, 'B', 10), played(2, 'C', 20)]),
  player('rb2', 'RB', 'D', [played(1, 'C', 30)]),
  player('wr1', 'WR', 'A', [played(1, 'B', 5)]),
  player('k1', 'K', 'A', [played(1, 'B', 7)]),
  player('def', 'DEF', 'A', [played(1, 'B', 12)]),
  player('nopos', null, 'A', [played(1, 'B', 99)])
]

describe('defenseRanks', () => {
  const ranks = defenseRanks(players)

  it('ranks each defense per position by points allowed per played game, fewest first', () => {
    // RB: B allowed 10 in 1 game; C allowed 20 + 30 over 2 games (weeks 1 and 2) → 25
    expect(ranks.get('B')?.get('RB')).toBe(1)
    expect(ranks.get('C')?.get('RB')).toBe(2)
    // C has played but faced no WR → 0 allowed → hardest; B allowed 5
    expect(ranks.get('C')?.get('WR')).toBe(1)
    expect(ranks.get('B')?.get('WR')).toBe(2)
  })

  it('is uniform for K and DEF and ignores players without a position', () => {
    expect(ranks.get('B')?.get('K')).toBe(2)
    expect(ranks.get('B')?.get('DEF')).toBe(2)
    expect(ranks.get('C')?.get('K')).toBe(1)
    expect([...(ranks.get('B')?.keys() ?? [])]).not.toContain('')
  })

  it('leaves defenses that have not played unranked', () => {
    expect(ranks.has('D')).toBe(false)
    expect(ranks.has('A')).toBe(false)
    expect(defenseRanks([]).size).toBe(0)
  })
})

describe('lastScheduledWeek', () => {
  it('is the latest week with any game, 0 without games', () => {
    expect(lastScheduledWeek(schedule)).toBe(6)
    expect(lastScheduledWeek(new Map())).toBe(0)
  })
})

describe('playerSchedule', () => {
  const ranks = defenseRanks(players)
  const rb1 = players[0]

  it('lists the remaining weeks with opponent and rank, byes as gaps', () => {
    const s = playerSchedule(rb1, schedule, ranks, 3)
    expect(s.entries).toEqual([
      { week: 3, opponent: 'D', rank: null },
      { week: 4, opponent: 'B', rank: 1 },
      { week: 5, opponent: null, rank: null },
      { week: 6, opponent: 'C', rank: 2 }
    ])
    expect(s.nextOpponent).toEqual({ team: 'D', rank: null })
    expect(s.rosSos).toBe(1.5)
    expect(s.byesRemaining).toBe(1)
  })

  it('has no next opponent on a bye week and none at season end', () => {
    const bye = playerSchedule(rb1, schedule, ranks, 5)
    expect(bye.nextOpponent).toBeNull()
    expect(bye.entries.map((e) => e.week)).toEqual([5, 6])
    expect(bye.rosSos).toBe(2)
    const over = playerSchedule(rb1, schedule, ranks, 7)
    expect(over).toEqual({ entries: [], nextOpponent: null, rosSos: null, byesRemaining: 0 })
  })

  it('skips the current week once the player has played it (Thursday game)', () => {
    const thursday = player('rb1', 'RB', 'A', [...rb1.weeks, played(3, 'D', 9)])
    const s = playerSchedule(thursday, schedule, ranks, 3)
    expect(s.entries[0]).toEqual({ week: 4, opponent: 'B', rank: 1 })
    expect(s.nextOpponent).toEqual({ team: 'B', rank: 1 })
  })

  it('is empty for a player without a team or a team without games; ranks follow the position', () => {
    expect(playerSchedule(player('fa', 'RB', null, []), schedule, ranks, 1).entries).toEqual([])
    expect(playerSchedule(player('x', 'RB', 'ZZZ', []), schedule, ranks, 1).byesRemaining).toBe(0)
    const wr = playerSchedule(player('wr', 'WR', 'A', []), schedule, ranks, 4)
    expect(wr.entries[0]).toEqual({ week: 4, opponent: 'B', rank: 2 })
    expect(
      playerSchedule(player('n', null, 'A', []), schedule, ranks, 4).entries[0].rank
    ).toBeNull()
  })
})
