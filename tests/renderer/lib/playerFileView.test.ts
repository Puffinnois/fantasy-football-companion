import { describe, expect, it } from 'vitest'
import {
  beatLine,
  chartColumns,
  currentWeekOf,
  rankTone,
  readRows,
  splitName
} from '@/lib/playerFileView'
import type { DetailWeek, PlayerValueRow } from '@shared/types'
import { signalsFixture } from '../../fixtures/signals'

const wk = (over: Partial<DetailWeek> & { week: number }): DetailWeek => ({
  opponent: 'DAL',
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

describe('playerFileView', () => {
  const weeks = [
    wk({ week: 1, played: true, points: 20, projected: 15 }),
    wk({ week: 2, played: true, points: 8, projected: 12 }),
    wk({ week: 3, projected: 11 }), // missed the game
    wk({ week: 4, projected: 14 }),
    wk({ week: 5, projected: 13 }),
    wk({ week: 6, projected: 12 }),
    wk({ week: 7, projected: 12 })
  ]
  const schedule = [
    { week: 4, opponent: 'NYG', rank: 25 },
    { week: 5, opponent: null, rank: null }
  ]

  it('takes the current week from the schedule, else after the last week', () => {
    expect(currentWeekOf({ weeks, schedule })).toBe(4)
    expect(currentWeekOf({ weeks, schedule: [] })).toBe(8)
    expect(currentWeekOf({ weeks: [], schedule: [] })).toBe(1)
  })

  it('builds columns through the current week + 2: played, DNP, upcoming', () => {
    const cols = chartColumns(weeks, schedule)
    expect(cols.map((c) => `${c.week}:${c.kind}`)).toEqual([
      '1:played',
      '2:played',
      '3:dnp',
      '4:upcoming',
      '5:upcoming',
      '6:upcoming'
    ])
    expect(cols[0].beat).toBe(true)
    expect(cols[1].beat).toBe(false)
    expect(cols[3].points).toBeNull()
    expect(beatLine(cols)).toBe('Beat the projection in 1 of 2 games')
    expect(beatLine([])).toBe('No games played yet')
  })

  it('reads the signals with their tones', () => {
    const row = {
      signals: signalsFixture({ vsProjPct: 0.15, rosSos: 24 }),
      market: { value: 5400, posRank: 3, tier: 1, trend30d: -120 }
    } as unknown as PlayerValueRow
    expect(readRows(row).map((r) => [r.value, r.tone])).toEqual([
      ['+1.8', 'bad'],
      ['+15%', 'good'],
      ['24.0', 'good'],
      ['5400 (−120)', 'bad']
    ])
    const empty = { signals: null, market: null } as unknown as PlayerValueRow
    expect(readRows(empty).map((r) => r.value)).toEqual(['—', '—', '—', '—'])
    expect([5, 15, 22, null].map(rankTone)).toEqual(['bad', null, 'good', null])
  })

  it('splits the first name from the rest', () => {
    expect(splitName("Ja'Marr Chase")).toEqual({ first: "Ja'Marr", last: 'Chase' })
    expect(splitName('Amon-Ra St. Brown')).toEqual({ first: 'Amon-Ra', last: 'St. Brown' })
    expect(splitName('Ravens')).toEqual({ first: '', last: 'Ravens' })
  })
})
