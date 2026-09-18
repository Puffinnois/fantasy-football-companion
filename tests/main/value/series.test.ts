import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { currentWeekFor, loadSeries, type PlayerSeries } from '@main/value/series'
import { seedLeague } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

describe('currentWeekFor', () => {
  const state = { season: '2026', week: 5, displayWeek: 6, seasonType: 'regular', fetchedAt: '' }
  it('uses Sleeper week for the current season, 19 for a past one, 1 without state', () => {
    expect(currentWeekFor(2026, state)).toBe(5)
    expect(currentWeekFor(2025, state)).toBe(19)
    expect(currentWeekFor(2026, null)).toBe(1)
    expect(currentWeekFor(2026, { ...state, week: 0 })).toBe(1)
    expect(currentWeekFor(2026, { ...state, week: 22 })).toBe(18)
  })
})

describe('loadSeries', () => {
  let db: Db
  let byId: Map<string, PlayerSeries>
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    const bundle = loadSeries(db, 'L1', SEASON)
    byId = new Map(bundle.players.map((p) => [p.base.playerId, p]))
  })

  it('carries the season context', () => {
    const bundle = loadSeries(db, 'L1', SEASON)
    expect(bundle.currentWeek).toBe(3)
    expect(bundle.projectionsStored).toBe(true)
    expect(bundle.teamCount).toBe(2)
    expect(bundle.rules?.rosterSlots.some((s) => s.slot === 'FLEX')).toBe(true)
  })

  it('builds one week per game, projection or points row with points, projection, line and usage', () => {
    const barkley = byId.get('4866')
    expect(barkley?.statsAvailable).toBe(true)
    expect(barkley?.base.byeWeek).toBeNull()
    expect(barkley?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5])
    const [w1, , w3, w4] = barkley?.weeks ?? []
    expect(w1).toMatchObject({
      opponent: 'DAL',
      played: true,
      points: 20,
      projected: null,
      snapPct: 0.83
    })
    expect(w1.line.rush_yd).toBe(60)
    expect(w1.line.rush_att).toBeGreaterThan(0)
    expect(w3).toMatchObject({ opponent: 'NYG', played: true, points: 30, projected: 10, line: {} })
    expect(w4).toMatchObject({ opponent: 'WAS', played: false, points: null, projected: 8 })
  })

  it('skips weeks with nothing (bye, no projection) and keeps projection-only weeks', () => {
    const jefferson = byId.get('6794')
    expect(jefferson?.base.byeWeek).toBe(2)
    expect(jefferson?.weeks.map((w) => [w.week, w.played, w.projected])).toEqual([
      [1, true, null],
      [3, false, 13],
      [4, false, 15]
    ])
  })

  it('scores a defense from team rows with points allowed', () => {
    const lar = byId.get('LAR')
    expect(lar?.statsAvailable).toBe(true)
    expect(lar?.weeks[0]).toMatchObject({ week: 1, opponent: 'HOU', played: true, points: 8 })
    expect(lar?.weeks[0].line.pts_allow).toBe(9)
    expect(lar?.weeks[1]).toMatchObject({ week: 2, opponent: 'DAL', played: false, line: {} })
  })

  it('marks an unmatched player as unavailable with an empty series', () => {
    const cook = byId.get('8259')
    expect(cook?.statsAvailable).toBe(false)
    expect(cook?.weeks).toEqual([])
  })

  it('exposes the regular-season schedule in Sleeper codes', () => {
    const bundle = loadSeries(db, 'L1', SEASON)
    expect(bundle.schedule.get('LAR')?.get(1)).toBe('HOU')
    expect(bundle.schedule.get('PHI')?.get(5)).toBe('LAR')
    expect(bundle.schedule.get('MIN')?.has(2)).toBe(false)
  })
})
