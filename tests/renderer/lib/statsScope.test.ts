import { describe, expect, it } from 'vitest'
import {
  defaultScope,
  freshness,
  lastWeek,
  minGames,
  queryScope,
  rangeLabel,
  regularWeeks,
  seasonOptions,
  type StatsScope
} from '@/lib/stats/scope'
import { STATUS } from '../../fixtures/statsScreens'

const scope = (over: Partial<StatsScope> = {}): StatsScope => ({
  season: 2026,
  seasonType: 'REG',
  weeks: null,
  scoring: 'ppr',
  ...over
})

describe('the Stats scope (spec §9.1)', () => {
  it('offers every season since 2019, newest first', () => {
    expect(seasonOptions(STATUS)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019])
    expect(seasonOptions(null, new Date('2027-03-01'))[0]).toBe(2027)
  })

  it('opens on the latest season, with the league scoring when there is a league', () => {
    expect(defaultScope(STATUS, true)).toEqual(scope({ scoring: 'league' }))
    expect(defaultScope(STATUS, false).scoring).toBe('ppr')
    const preseason = {
      ...STATUS,
      through: { season: 2025, seasonType: 'POST' as const, week: 22 }
    }
    expect(defaultScope(preseason, false).season).toBe(2025)
  })

  it('knows each season length and the week the data runs through', () => {
    expect([2019, 2020, 2021, 2025].map(regularWeeks)).toEqual([17, 17, 18, 18])
    expect(lastWeek(2026, STATUS)).toBe(6)
    expect(lastWeek(2025, STATUS)).toBe(18)
  })

  it('asks for weeks only in a regular season with a range', () => {
    expect(queryScope(scope(), STATUS)).toEqual({ seasons: [2026], seasonType: 'REG' })
    expect(queryScope(scope({ weeks: [2, 9] }), STATUS)).toEqual({
      seasons: [2026],
      seasonType: 'REG',
      weeks: [2, 6]
    })
    expect(queryScope(scope({ seasonType: 'POST', weeks: [2, 4] }), STATUS)).toEqual({
      seasons: [2026],
      seasonType: 'POST'
    })
  })

  it('labels the range and the games the Stats home needs', () => {
    expect(rangeLabel(scope(), STATUS)).toBe('Weeks 1–6')
    expect(rangeLabel(scope({ weeks: [3, 3] }), STATUS)).toBe('Week 3')
    expect(rangeLabel(scope({ season: 2024, seasonType: 'ALL' }), STATUS)).toBe(
      'Season and postseason'
    )
    expect(minGames(scope(), STATUS)).toBe(3)
    expect(minGames(scope({ season: 2025 }), STATUS)).toBe(9)
    expect(minGames(scope({ seasonType: 'POST' }), STATUS)).toBe(1)
  })

  it('says how fresh the data is (spec §5.3)', () => {
    const now = Date.parse('2026-10-19T11:00:00.000Z')
    expect(freshness(STATUS, now)).toBe('Data through 2026 week 6 · updated 3 h ago')
    expect(freshness({ ...STATUS, busy: true }, now)).toBe('Data through 2026 week 6 · updating…')
    expect(
      freshness({ ...STATUS, through: { season: 2025, seasonType: 'POST', week: 22 } }, now)
    ).toBe('Data through the 2025 postseason · updated 3 h ago')
    expect(freshness({ ...STATUS, through: null, busy: true }, now)).toBe('Loading the stats…')
    expect(freshness({ available: false, through: null, updatedAt: null, busy: false })).toBe(
      'Stats unavailable'
    )
    expect(freshness(null)).toBe('')
  })
})
