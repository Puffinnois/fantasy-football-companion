import { describe, expect, it } from 'vitest'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'
import {
  opportunities,
  percentile,
  positionTotals,
  production,
  SHARE_TREND_THRESHOLD,
  SNAP_TREND_THRESHOLD,
  statSignals,
  stdev,
  TD_FLAG_THRESHOLD,
  usageTrend
} from '@main/value/signals'

const week = (over: Partial<SeriesWeek> = {}): SeriesWeek => ({
  week: 1,
  opponent: null,
  played: true,
  points: 10,
  projected: null,
  line: {},
  snapPct: null,
  targetShare: null,
  rushShare: null,
  airYardsShare: null,
  wopr: null,
  ...over
})
const series = (position: string | null, weeks: SeriesWeek[]): PlayerSeries => ({
  base: {
    playerId: 'p',
    fullName: 'P',
    position,
    team: 'PHI',
    byeWeek: null,
    injuryStatus: null,
    rookie: false,
    watched: false,
    ownerRosterId: null,
    ownerName: null,
    ownerIsMe: false
  },
  statsAvailable: true,
  rosterSlot: null,
  weeks: weeks.map((w, i) => ({ ...w, week: i + 1 }))
})

describe('usageTrend', () => {
  it('labels at the threshold (inclusive) in both directions', () => {
    expect(usageTrend([0, 0, 0, 0.5, 0.5, 0.5], 0.25)).toEqual({
      season: 0.25,
      recent: 0.5,
      trend: 'rising'
    })
    expect(usageTrend([0.5, 0.5, 0.5, 0, 0, 0], 0.25)?.trend).toBe('falling')
    expect(usageTrend([0, 0, 0, 0.5, 0.5, 0.5], 0.26)?.trend).toBe('flat')
    expect(SHARE_TREND_THRESHOLD).toBe(0.03)
    expect(SNAP_TREND_THRESHOLD).toBe(0.05)
  })

  it('needs two games; with fewer than three the recent window is the season', () => {
    expect(usageTrend([0.5], 0.03)).toBeNull()
    expect(usageTrend([0.5, 0.75], 0.03)).toEqual({ season: 0.625, recent: 0.625, trend: 'flat' })
  })
})

describe('opportunities / production', () => {
  it('counts targets + carries, pass attempts + carries for a QB, nothing for K / DEF', () => {
    expect(opportunities('RB', { rec_tgt: 4, rush_att: 18 })).toBe(22)
    expect(opportunities('WR', { rec_tgt: 9 })).toBe(9)
    expect(opportunities('QB', { pass_att: 30, rush_att: 5 })).toBe(35)
    expect(opportunities('K', { fga: 3 })).toBeNull()
    expect(opportunities('DEF', {})).toBeNull()
    expect(opportunities(null, {})).toBeNull()
  })

  it('adds passing TDs and yards for a QB only', () => {
    expect(production('QB', { pass_td: 2, rush_td: 1, pass_yd: 250, rush_yd: 20 })).toEqual({
      tds: 3,
      yards: 270
    })
    expect(production('WR', { rec_td: 1, rec_yd: 80, rush_yd: 5, pass_td: 1 })).toEqual({
      tds: 1,
      yards: 85
    })
  })

  it('sums the position over every player and played week', () => {
    const totals = positionTotals([
      series('RB', [
        week({ line: { rush_att: 10, rush_td: 1, rush_yd: 50 } }),
        week({ line: { rush_att: 10, rec_tgt: 2, rec_yd: 20 } }),
        week({ played: false, line: { rush_att: 99 } })
      ]),
      series('RB', [week({ line: { rush_att: 5, rush_yd: 30 } })]),
      series('K', [week({ line: { fga: 3 } })])
    ])
    expect(totals.get('RB')).toEqual({ opportunities: 27, tds: 1, yards: 100 })
    expect(totals.has('K')).toBe(false)
  })
})

describe('percentile / stdev', () => {
  it('interpolates linearly between ranks', () => {
    expect(percentile([4, 1, 3, 2], 0.25)).toBe(1.75)
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3.25)
    expect(percentile([5], 0.5)).toBe(5)
  })

  it('is the population standard deviation', () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})

describe('statSignals', () => {
  // position: 1 000 opportunities, 50 TDs (rate 0.05), 10 000 yards (10 per opportunity)
  const totals = { opportunities: 1000, tds: 50, yards: 10000 }
  const wr = (tdsPerGame: number[]): PlayerSeries =>
    series(
      'WR',
      tdsPerGame.map((td) => week({ line: { rec_tgt: 10, rec_td: td, rec_yd: 120 } }))
    )

  it('flags TD regression at ±TD_FLAG_THRESHOLD and measures yards per opportunity', () => {
    expect(TD_FLAG_THRESHOLD).toBe(1.5)
    // 30 opportunities → 1.5 expected TDs
    expect(statSignals(wr([1, 1, 1]), totals, null)).toMatchObject({
      tdDelta: 1.5,
      tdFlag: 'down',
      ypo: 12,
      ypoDelta: 2
    })
    expect(statSignals(wr([0, 0, 0]), totals, null)).toMatchObject({ tdDelta: -1.5, tdFlag: 'up' })
    expect(statSignals(wr([1, 1, 0]), totals, null)).toMatchObject({ tdDelta: 0.5, tdFlag: null })
    // no opportunities yet, or no positional totals → nothing to compare
    expect(statSignals(series('WR', [week()]), totals, null)).toMatchObject({
      tdDelta: null,
      tdFlag: null,
      ypo: null,
      ypoDelta: null
    })
    expect(statSignals(wr([1]), undefined, null)).toMatchObject({ tdDelta: null, ypoDelta: null })
    expect(statSignals(series('K', [week({ line: { fgm: 2 } })]), undefined, null)).toMatchObject({
      tdDelta: null,
      ypo: null
    })
  })

  it('compares points with the projection over played weeks that had one', () => {
    const s = statSignals(
      series('RB', [
        week({ points: 10, projected: 8 }),
        week({ points: 12, projected: 8 }),
        week({ points: 20, projected: null }),
        week({ played: false, points: null, projected: 15 })
      ]),
      undefined,
      null
    )
    expect(s).toMatchObject({ vsProjPoints: 6 })
    expect(s.vsProjPct).toBeCloseTo(0.375)
    expect(
      statSignals(series('RB', [week({ points: 3, projected: 0 })]), undefined, null)
    ).toMatchObject({
      vsProjPoints: 3,
      vsProjPct: null
    })
    expect(statSignals(series('RB', [week({ points: 3 })]), undefined, null)).toMatchObject({
      vsProjPoints: null,
      vsProjPct: null
    })
  })

  it('reports consistency from three games and the start rate against the replacement PPG', () => {
    const three = series('RB', [week({ points: 6 }), week({ points: 10 }), week({ points: 20 })])
    const s = statSignals(three, undefined, 10)
    expect(s).toMatchObject({ floor: 8, ceiling: 15, stdev: 5.89 })
    expect(s.startRate).toBeCloseTo(2 / 3)
    expect(statSignals(three, undefined, null).startRate).toBeNull()
    const two = series('RB', [week({ points: 6 }), week({ points: 10 })])
    expect(statSignals(two, undefined, 10)).toMatchObject({
      floor: null,
      ceiling: null,
      stdev: null,
      startRate: null
    })
  })

  it('builds usage trends per metric from the played games that have it', () => {
    const s = statSignals(
      series('RB', [
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: null, rushShare: null }),
        week({ played: false, points: null, snapPct: 0.1 })
      ]),
      undefined,
      null
    )
    expect(s.usage.snapPct?.trend).toBe('rising')
    expect(s.usage.snapPct?.season).toBeCloseTo(0.75)
    expect(s.usage.snapPct?.recent).toBeCloseTo(0.9)
    expect(s.usage.rushShare).toMatchObject({ trend: 'flat' })
    expect(s.usage.targetShare).toBeNull()
    expect(s.usage.airYardsShare).toBeNull()
    expect(s.usage.wopr).toBeNull()
  })
})
