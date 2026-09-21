import { describe, expect, it } from 'vitest'
import { barItems, signalLines, usageRows } from '@/lib/detailView'
import type { DetailWeek } from '@shared/types'
import { signalsFixture } from '../../fixtures/signals'

describe('signalLines', () => {
  it('phrases TD regression, efficiency, projection accuracy and consistency', () => {
    expect(signalLines(signalsFixture(), 5)).toEqual([
      'TDs +1.8 vs expected — regression candidate',
      'Yds/opp 8.2 · -0.4 vs position',
      'vs projection +12.30 pts (+9%)',
      'Floor 6.10 · Ceiling 17.40 · start-worthy 63%'
    ])
    expect(signalLines(signalsFixture({ tdFlag: 'up', tdDelta: -1.6 }), 5)[0]).toBe(
      'TDs -1.6 vs expected — due for more'
    )
    expect(signalLines(signalsFixture({ tdFlag: null, tdDelta: 0.4 }), 5)[0]).toBe(
      'TDs +0.4 vs expected'
    )
  })

  it('skips families without data and states the consistency gate', () => {
    const bare = signalsFixture({
      tdDelta: null,
      tdFlag: null,
      ypo: null,
      ypoDelta: null,
      vsProjPoints: null,
      vsProjPct: null,
      floor: null,
      ceiling: null,
      stdev: null,
      startRate: null
    })
    expect(signalLines(bare, 2)).toEqual(['Consistency: needs 3 games (2 played)'])
    expect(signalLines(signalsFixture({ vsProjPct: null }), 5)[2]).toBe('vs projection +12.30 pts')
    expect(signalLines(signalsFixture({ startRate: null }), 5)[3]).toBe(
      'Floor 6.10 · Ceiling 17.40'
    )
  })
})

describe('usageRows', () => {
  it('follows the position; none for K, DEF or unknown', () => {
    expect(usageRows('RB').map((r) => r.metric)).toEqual(['snapPct', 'rushShare', 'wopr'])
    expect(usageRows('WR').map((r) => r.metric)).toEqual(['snapPct', 'targetShare', 'wopr'])
    expect(usageRows('TE').map((r) => r.label)).toEqual(['Snap %', 'Target share', 'WOPR'])
    expect(usageRows('QB').map((r) => r.metric)).toEqual(['snapPct'])
    expect(usageRows('K')).toEqual([])
    expect(usageRows('DEF')).toEqual([])
    expect(usageRows(null)).toEqual([])
  })
})

describe('barItems', () => {
  const week = (over: Partial<DetailWeek>): DetailWeek => ({
    week: 1,
    opponent: null,
    played: false,
    points: null,
    projected: null,
    snapPct: null,
    targetShare: null,
    rushShare: null,
    wopr: null,
    stats: {},
    ...over
  })

  it('keeps played weeks and projected weeks, drops the rest', () => {
    expect(
      barItems([
        week({ week: 1, played: true, points: 10, projected: 8 }),
        week({ week: 2, played: true, points: 0 }),
        week({ week: 3, projected: 12 }),
        week({ week: 4 })
      ])
    ).toEqual([
      { label: '1', value: 10, marker: 8 },
      { label: '2', value: 0, marker: null },
      { label: '3', value: null, marker: 12 }
    ])
  })
})
