import { describe, expect, it } from 'vitest'
import { replacementLevels, starterCounts } from '@main/value/replacement'
import type { RosterSlotCount } from '@shared/rules'

const slots: RosterSlotCount[] = [
  { slot: 'QB', count: 1 },
  { slot: 'RB', count: 1 },
  { slot: 'WR', count: 1 },
  { slot: 'FLEX', count: 1 },
  { slot: 'BN', count: 3 }
]

describe('starterCounts', () => {
  it('adds dedicated slots × teams and hands flex slots to the best next player', () => {
    const metrics = new Map([
      ['QB', [30, 25]],
      ['RB', [5, 20, 10, 15]], // unsorted on purpose
      ['WR', [18, 12, 8]]
    ])
    // base: QB 2, RB 2, WR 2; flex 1: RB next 10 vs WR next 8 → RB; flex 2: RB 5 vs WR 8 → WR
    expect(starterCounts(slots, 2, metrics)).toEqual(
      new Map([
        ['QB', 2],
        ['RB', 3],
        ['WR', 3],
        ['TE', 0],
        ['K', 0],
        ['DEF', 0]
      ])
    )
  })

  it('stops handing out flex starters when no eligible position has a player left', () => {
    const metrics = new Map([['RB', [20]]])
    expect(starterCounts(slots, 2, metrics).get('RB')).toBe(2) // 1 slot × 2 teams, flex unfilled
    expect(starterCounts(slots, 2, metrics).get('WR')).toBe(2)
  })

  it('ignores slots that are neither positions nor flex', () => {
    const counts = starterCounts(
      [
        { slot: 'BN', count: 6 },
        { slot: 'IR', count: 2 }
      ],
      12,
      new Map()
    )
    expect([...counts.values()].every((n) => n === 0)).toBe(true)
  })
})

describe('replacementLevels', () => {
  it('takes the (starters + 1)-th best metric, or the worst one when fewer players exist', () => {
    const metrics = new Map([
      ['QB', [30, 25, 22]],
      ['RB', [20, 15, 10, 5]],
      ['WR', [18, 12, 8]]
    ])
    const levels = replacementLevels(slots, 2, metrics)
    expect(levels.get('QB')).toEqual({ level: 22, starters: 2 })
    expect(levels.get('RB')).toEqual({ level: 5, starters: 3 }) // 4th best
    expect(levels.get('WR')).toEqual({ level: 8, starters: 3 }) // only 3 WRs → worst
  })

  it('is null for a position without players and 0 starters for positions without slots', () => {
    const levels = replacementLevels(slots, 2, new Map([['K', [9, 7]]]))
    expect(levels.get('RB')).toBeNull()
    expect(levels.get('K')).toEqual({ level: 9, starters: 0 })
  })
})
