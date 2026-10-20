import { describe, expect, it } from 'vitest'
import { cellTitle, fmtStat, heatOf, ordinal, reliabilityOf } from '@/lib/stats/format'
import { value } from '../../fixtures/statsScreens'

describe('stats value formatting', () => {
  it('writes each unit as the Stats screens do', () => {
    expect(fmtStat(1714, { unit: 'count', decimals: 0, kind: 'count' })).toBe('1,714')
    expect(fmtStat(285.67, { unit: 'count', decimals: 0, kind: 'count' }, true)).toBe('285.7')
    expect(fmtStat(0.3514, { unit: 'pct', decimals: 1 })).toBe('35.1%')
    expect(fmtStat(0.123, { unit: 'epa', decimals: 3 })).toBe('+0.123')
    expect(fmtStat(-0.05, { unit: 'epa', decimals: 3 })).toBe('−0.050')
    expect(fmtStat(3.14, { unit: 'pp', decimals: 1 })).toBe('+3.1')
    expect(fmtStat(-0.04, { unit: 'pp', decimals: 1 })).toBe('0.0')
    expect(fmtStat(2.714, { unit: 'seconds', decimals: 2 })).toBe('2.71')
    expect(fmtStat(null, { unit: 'yards', decimals: 1 })).toBe('—')
    // A rate is already per play: per game changes nothing.
    expect(fmtStat(8.44, { unit: 'yards', decimals: 1, kind: 'rate' }, true)).toBe('8.4')
  })

  it('shades by percentile in seven steps, never a neutral metric', () => {
    expect([95, 80, 61, 50, 39, 20, 5].map((p) => heatOf(p, 'higher'))).toEqual([
      'h3',
      'h2',
      'h1',
      'n',
      'l1',
      'l2',
      'l3'
    ])
    expect(heatOf(null, 'higher')).toBe('n')
    expect(heatOf(99, 'neutral')).toBe('n')
  })

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 73.4, 100].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '73rd',
      '100th'
    ])
  })

  it('says on hover where a value ranks and what its sample is (spec §9.2)', () => {
    const info = { sampleLabel: 'routes', direction: 'higher' as const }
    expect(cellTitle(value(2.41, { percentile: 92.4, rank: 7, sample: 1412 }), info, 'WR')).toBe(
      '92nd percentile among qualified WRs\nRank 7 among WRs\n1,412 routes'
    )
    expect(
      cellTitle(value(1.9, { qualified: false, sample: 40, estimated: true }), info, 'WR')
    ).toBe(
      '40 routes\nBelow the qualifying sample\nEstimated: participation for this season is not published yet'
    )
    expect(
      cellTitle(
        value(0.12, { percentile: 50, rank: 16, sample: 380 }),
        { sampleLabel: 'plays', direction: 'higher' },
        null
      )
    ).toBe('50th percentile among qualified teams\nRank 16\n380 plays')
  })

  it('words a metric reliability from its stability (spec §8.6)', () => {
    expect(reliabilityOf({ stability: null })).toBeNull()
    expect(
      reliabilityOf({
        stability: { yearToYear: 0.684, pairs: 400, splitHalf: 0.8, prior: 7, reliability: 'high' }
      })
    ).toEqual({
      level: 'high',
      text: 'Reliability high: carries over well from one season to the next (year-to-year r 0.68)'
    })
  })
})
