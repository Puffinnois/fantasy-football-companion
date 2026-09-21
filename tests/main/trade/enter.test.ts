import { describe, expect, it } from 'vitest'
import {
  lineupSlots,
  optimalLineup,
  type Candidate,
  type LineupSlot,
  type Placed
} from '@main/lineup/optimal'
import { canEnter, reachableSlots } from '@main/trade/enter'

const c = (id: string, position: string | null, value: number): Candidate => ({
  id,
  name: id,
  position,
  value
})

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

// RB · WR · FLEX with the tie broken the "wrong" way for a naive eligible-only test.
const slots: LineupSlot[] = [
  { slot: 'RB', eligible: ['RB'] },
  { slot: 'WR', eligible: ['WR'] },
  { slot: 'FLEX', eligible: ['RB', 'WR', 'TE'] }
]
const A = c('A', 'RB', 10)
const B = c('B', 'WR', 9)
const W = c('W', 'WR', 4)
const starters: Placed[] = [
  { slot: 'RB', player: A },
  { slot: 'WR', player: W },
  { slot: 'FLEX', player: B }
]

describe('reachableSlots', () => {
  it('follows the flex chain through the starters', () => {
    // RB → RB slot (A is RB) and FLEX (B is WR) → WR slot via B's position.
    expect(reachableSlots('RB', slots, starters)).toEqual([0, 1, 2])
    expect(reachableSlots('WR', slots, starters)).toEqual([1, 2])
    expect(reachableSlots('QB', slots, starters)).toEqual([])
    expect(reachableSlots(null, slots, starters)).toEqual([])
  })
})

describe('canEnter (spec 6b §2.3)', () => {
  it('sees the chain case: an RB worse than both RB and FLEX starters still enters through the WR slot', () => {
    const p = c('p', 'RB', 8) // < A (10) and < B (9), but > W (4) reachable via B
    expect(canEnter(p, slots, starters)).toBe(true)
    const after = optimalLineup(slots, [A, B, W, p])
    expect(after.total).toBe(27) // A + B + p
  })

  it('is false when every reachable starter is at least as good', () => {
    expect(canEnter(c('p', 'WR', 3), slots, starters)).toBe(false)
    expect(canEnter(c('p', 'WR', 4), slots, starters)).toBe(false) // ties do not raise the total
    expect(canEnter(c('p', 'QB', 40), slots, starters)).toBe(false) // no slot to reach
  })

  it('is true for an empty reachable slot', () => {
    const empty: Placed[] = [
      { slot: 'RB', player: A },
      { slot: 'WR', player: null },
      { slot: 'FLEX', player: B }
    ]
    expect(canEnter(c('p', 'RB', 1), slots, empty)).toBe(true) // FLEX → B (WR) → empty WR slot
  })

  it('never says false when adding the player raises the optimal total (random rosters)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      const nSlots = 2 + Math.floor(r() * 4)
      const rSlots = lineupSlots(
        Array.from({ length: nSlots }, () => ({
          slot: POOL_SLOTS[Math.floor(r() * POOL_SLOTS.length)],
          count: 1
        }))
      )
      const nPlayers = 1 + Math.floor(r() * 7)
      const players = Array.from({ length: nPlayers }, (_, i) =>
        c(`p${i}`, POSITIONS[Math.floor(r() * POSITIONS.length)], Math.round(r() * 60) / 2)
      )
      const extra = c('x', POSITIONS[Math.floor(r() * POSITIONS.length)], Math.round(r() * 60) / 2)
      const before = optimalLineup(rSlots, players)
      const after = optimalLineup(rSlots, [...players, extra])
      if (after.total > before.total + 1e-9) {
        expect({ seed, canEnter: canEnter(extra, rSlots, before.starters) }).toEqual({
          seed,
          canEnter: true
        })
      }
    }
  })
})
