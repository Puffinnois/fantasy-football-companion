import { describe, expect, it } from 'vitest'
import {
  assign,
  CLOSE_CALL_PTS,
  closeCall,
  currentAssignments,
  isUnavailable,
  lineupSlots,
  optimalLineup,
  swapsBetween,
  weekFlag,
  weekValue,
  type Candidate,
  type LineupSlot
} from '@main/lineup/optimal'

const c = (id: string, position: string | null, value: number, name = id): Candidate => ({
  id,
  name,
  position,
  value
})

/** The user's league shape: 1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF. */
const LEAGUE = lineupSlots([
  { slot: 'QB', count: 1 },
  { slot: 'RB', count: 2 },
  { slot: 'WR', count: 2 },
  { slot: 'TE', count: 1 },
  { slot: 'FLEX', count: 2 },
  { slot: 'K', count: 1 },
  { slot: 'DEF', count: 1 },
  { slot: 'BN', count: 6 },
  { slot: 'IR', count: 1 }
])

/** Every injective slot → player assignment; best = most slots filled, then the highest total. */
function bruteForce(slots: LineupSlot[], players: Candidate[]): { filled: number; total: number } {
  let best = { filled: -1, total: Number.NEGATIVE_INFINITY }
  const used = new Array<boolean>(players.length).fill(false)
  const walk = (i: number, filled: number, total: number): void => {
    if (i === slots.length) {
      if (filled > best.filled || (filled === best.filled && total > best.total + 1e-9)) {
        best = { filled, total }
      }
      return
    }
    walk(i + 1, filled, total)
    players.forEach((p, j) => {
      if (used[j] || p.position === null || !slots[i].eligible.includes(p.position)) return
      used[j] = true
      walk(i + 1, filled + 1, total + p.value)
      used[j] = false
    })
  }
  walk(0, 0, 0)
  return best
}

/** Small deterministic generator so a failing case reproduces from its seed. */
function rng(seed: number): () => number {
  let s = seed
  return (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const POOL_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX', 'K']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', null]

describe('lineupSlots', () => {
  it('expands counts in order and drops bench, reserve and unknown slots', () => {
    expect(LEAGUE.map((s) => s.slot)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'FLEX',
      'K',
      'DEF'
    ])
    expect(LEAGUE[6].eligible).toEqual(['RB', 'WR', 'TE'])
    expect(
      lineupSlots([
        { slot: 'IDP_FLEX', count: 2 },
        { slot: 'WEIRD', count: 1 }
      ])
    ).toEqual([])
  })
})

describe('assign', () => {
  it('finds the minimum-cost perfect matching', () => {
    expect(
      assign([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2]
      ])
    ).toEqual([1, 0, 2])
    expect(assign([])).toEqual([])
  })
})

describe('optimalLineup', () => {
  it('fills the league shape: dedicated slots take the best of each position, flex the best leftovers', () => {
    const roster = [
      c('qb1', 'QB', 20),
      c('qb2', 'QB', 18),
      c('rb1', 'RB', 16),
      c('rb2', 'RB', 12),
      c('rb3', 'RB', 9),
      c('wr1', 'WR', 15),
      c('wr2', 'WR', 11),
      c('wr3', 'WR', 10),
      c('wr4', 'WR', 4),
      c('te1', 'TE', 8),
      c('te2', 'TE', 7),
      c('k1', 'K', 8),
      c('def1', 'DEF', 6)
    ]
    const out = optimalLineup(LEAGUE, roster)
    expect(out.starters.map((e) => `${e.slot}:${e.player?.id}`)).toEqual([
      'QB:qb1',
      'RB:rb1',
      'RB:rb2',
      'WR:wr1',
      'WR:wr2',
      'TE:te1',
      'FLEX:wr3',
      'FLEX:rb3',
      'K:k1',
      'DEF:def1'
    ])
    expect(out.total).toBe(115)
    expect(out.bench.map((b) => b.id)).toEqual(['qb2', 'te2', 'wr4'])
  })

  it('matches brute force on random rosters with mixed flex kinds, ties and ineligible players', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed)
      const nSlots = 2 + Math.floor(r() * 3)
      const slots = lineupSlots(
        Array.from({ length: nSlots }, () => ({
          slot: POOL_SLOTS[Math.floor(r() * POOL_SLOTS.length)],
          count: 1
        }))
      )
      const nPlayers = 1 + Math.floor(r() * 7)
      const players = Array.from({ length: nPlayers }, (_, i) =>
        c(
          `p${i}`,
          POSITIONS[Math.floor(r() * POSITIONS.length)],
          Math.round((r() * 33 - 3) * 2) / 2
        )
      )
      const expected = bruteForce(slots, players)
      const actual = optimalLineup(slots, players)
      const filled = actual.starters.filter((e) => e.player !== null).length
      expect({ seed, filled, total: actual.total }).toEqual({
        seed,
        filled: expected.filled,
        total: Math.round(expected.total * 100) / 100
      })
      for (const e of actual.starters) {
        if (e.player) {
          const slot = slots.find((s) => s.slot === e.slot)
          expect(e.player.position !== null && slot?.eligible.includes(e.player.position)).toBe(
            true
          )
        }
      }
      expect(new Set(actual.starters.flatMap((e) => (e.player ? [e.player.id] : []))).size).toBe(
        filled
      )
    }
  })

  it('leaves slots empty only when nobody eligible is left, and still starts a negative projection', () => {
    const slots = lineupSlots([
      { slot: 'QB', count: 1 },
      { slot: 'RB', count: 2 }
    ])
    const out = optimalLineup(slots, [c('rb1', 'RB', -1.5), c('wr1', 'WR', 20)])
    expect(out.starters).toEqual([
      { slot: 'QB', player: null },
      { slot: 'RB', player: c('rb1', 'RB', -1.5) },
      { slot: 'RB', player: null }
    ])
    expect(out.total).toBe(-1.5)
    expect(out.bench.map((b) => b.id)).toEqual(['wr1'])
  })

  it('places ties deterministically whatever the input order', () => {
    const slots = lineupSlots([
      { slot: 'RB', count: 1 },
      { slot: 'FLEX', count: 1 }
    ])
    const a = optimalLineup(slots, [c('z', 'RB', 10, 'Zed'), c('a', 'RB', 10, 'Aaron')])
    const b = optimalLineup(slots, [c('a', 'RB', 10, 'Aaron'), c('z', 'RB', 10, 'Zed')])
    expect(a.starters.map((e) => e.player?.id)).toEqual(['a', 'z'])
    expect(b.starters).toEqual(a.starters)
  })

  it('seats the higher-valued player of a position in the dedicated slot, the other in flex', () => {
    const slots = lineupSlots([
      { slot: 'RB', count: 1 },
      { slot: 'FLEX', count: 1 }
    ])
    const out = optimalLineup(slots, [c('rb2', 'RB', 8), c('rb1', 'RB', 14)])
    expect(out.starters.map((e) => e.player?.id)).toEqual(['rb1', 'rb2'])
  })
})

describe('currentAssignments', () => {
  it('maps starters onto the non-reserve roster_positions, empties as null, IDP dropped', () => {
    const positions = ['QB', 'RB', 'WR', 'FLEX', 'IDP_FLEX', 'K', 'BN', 'BN', 'IR']
    expect(currentAssignments(positions, ['q', '0', 'w', 'f', 'lb', 'k'])).toEqual([
      { slot: 'QB', id: 'q' },
      { slot: 'RB', id: null },
      { slot: 'WR', id: 'w' },
      { slot: 'FLEX', id: 'f' },
      { slot: 'K', id: 'k' }
    ])
    expect(currentAssignments(['QB', 'RB'], ['q'])).toEqual([
      { slot: 'QB', id: 'q' },
      { slot: 'RB', id: null }
    ])
    expect(currentAssignments(['QB'], ['q', 'extra'])).toEqual([{ slot: 'QB', id: 'q' }])
  })
})

describe('swapsBetween', () => {
  const slots = lineupSlots([
    { slot: 'RB', count: 1 },
    { slot: 'WR', count: 1 },
    { slot: 'FLEX', count: 1 }
  ])
  it('ignores players who only change slot', () => {
    const optimal = optimalLineup(slots, [
      c('rb1', 'RB', 10),
      c('wr1', 'WR', 9),
      c('rb2', 'RB', 8)
    ]).starters
    const current = [
      { slot: 'RB', player: c('rb2', 'RB', 8) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('rb1', 'RB', 10) }
    ]
    expect(swapsBetween(optimal, current)).toEqual([])
  })

  it('pairs each new starter with a removed one, same position first, then the weakest', () => {
    const optimal = [
      { slot: 'RB', player: c('rb1', 'RB', 10) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('te1', 'TE', 7) }
    ]
    const current = [
      { slot: 'RB', player: c('rb2', 'RB', 4) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('wr2', 'WR', 6) }
    ]
    expect(swapsBetween(optimal, current)).toEqual([
      { slot: 'RB', out: c('rb2', 'RB', 4), in: c('rb1', 'RB', 10), delta: 6 },
      { slot: 'FLEX', out: c('wr2', 'WR', 6), in: c('te1', 'TE', 7), delta: 1 }
    ])
  })

  it('fills an empty current slot with out = null and delta = the new value', () => {
    const optimal = [{ slot: 'RB', player: c('rb1', 'RB', 10.25) }]
    expect(swapsBetween(optimal, [{ slot: 'RB', player: null }])).toEqual([
      { slot: 'RB', out: null, in: c('rb1', 'RB', 10.25), delta: 10.25 }
    ])
  })
})

describe('closeCall', () => {
  const flex = { slot: 'FLEX', eligible: ['RB', 'WR', 'TE'] }
  it('returns the best eligible bench player inside the band, else null', () => {
    const bench = [c('qb2', 'QB', 18), c('wr3', 'WR', 9), c('rb3', 'RB', 8)]
    expect(closeCall(flex, c('wr2', 'WR', 9 + CLOSE_CALL_PTS), bench)).toEqual(c('wr3', 'WR', 9))
    expect(closeCall(flex, c('wr2', 'WR', 9 + CLOSE_CALL_PTS + 0.1), bench)).toBeNull()
    expect(closeCall({ slot: 'QB', eligible: ['QB'] }, c('qb1', 'QB', 19), bench)).toEqual(
      c('qb2', 'QB', 18)
    )
    expect(closeCall(flex, null, bench)).toBeNull()
    expect(closeCall(flex, c('wr2', 'WR', 9), [])).toBeNull()
  })
})

describe('weekValue / weekFlag', () => {
  const played = { played: true, points: 12.3, projected: 15, hasGame: true }
  const upcoming = { played: false, points: null, projected: 15, hasGame: true }
  const noProjection = { played: false, points: null, projected: null, hasGame: true }
  it('uses points when played, projection otherwise, 0 without either', () => {
    expect(weekValue(played)).toBe(12.3)
    expect(weekValue(upcoming)).toBe(15)
    expect(weekValue(noProjection)).toBe(0)
    expect(weekValue(null)).toBe(0)
  })
  it('flags byes always, statuses in the current week only, nothing once played', () => {
    expect(weekFlag(null, 'Out', true)).toBe('bye')
    expect(weekFlag({ ...upcoming, hasGame: false }, null, false)).toBe('bye')
    expect(weekFlag(upcoming, 'Out', true)).toBe('out')
    expect(weekFlag(upcoming, 'IR', true)).toBe('out')
    expect(weekFlag(upcoming, 'Doubtful', true)).toBe('doubtful')
    expect(weekFlag(upcoming, 'Questionable', true)).toBe('questionable')
    expect(weekFlag(upcoming, 'Out', false)).toBeNull()
    expect(weekFlag(upcoming, null, true)).toBeNull()
    expect(weekFlag(played, 'Out', true)).toBeNull()
    expect(isUnavailable('out')).toBe(true)
    expect(isUnavailable('doubtful')).toBe(true)
    expect(isUnavailable('questionable')).toBe(false)
    expect(isUnavailable('bye')).toBe(false)
    expect(isUnavailable(null)).toBe(false)
  })
})
