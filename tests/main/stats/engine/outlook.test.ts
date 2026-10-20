import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { gameForecasts } from '@main/stats/engine/games'
import { playerOutlook, signalOf, trendOf } from '@main/stats/engine/outlook'
import { rebuildModels } from '@main/stats/models/build'
import type { MetricValue, StatsRow } from '@shared/stats/types'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, WR } from '../../../fixtures/statsDerived'

const metric = (
  value: number | null,
  sample: number | null = null,
  qualified = true
): MetricValue => ({
  value,
  raw: value,
  sample,
  qualified,
  percentile: null,
  rank: null,
  estimated: false
})
const row = (values: Record<string, MetricValue>, games = 10, id = 'p'): StatsRow => ({
  id,
  name: id,
  team: 'BUF',
  position: 'WR',
  group: {},
  games,
  values
})

describe('the player outlook (stats-analysis spec §8.5)', () => {
  it('flags a role change beyond the week-to-week noise', () => {
    // 20 of 100 team targets; 12 of the last 40: 30 % against 8 of 60 (13 %) before.
    const season = row({ target_share: metric(0.2, 20) })
    const last = row({ target_share: metric(0.3, 12) })
    const weeks = [0.12, 0.14, 0.13, 0.15, 0.29, 0.31, 0.3, 0.3].map((v) =>
      row({ target_share: metric(v) })
    )
    const t = trendOf('target_share', season, last, weeks)
    expect(t.change).toBeCloseTo(0.3 - 8 / 60, 9)
    expect(t.z!).toBeGreaterThan(2)
    expect(t.roleChange).toBe('up')
    // Without three earlier games there is no test.
    expect(trendOf('target_share', season, last, weeks.slice(2)).z).toBeNull()
    // Noisy weeks: the same change is not a role change.
    const noisy = [0.05, 0.3, 0.02, 0.2, 0.5, 0.1, 0.4, 0.2].map((v) =>
      row({ target_share: metric(v) })
    )
    expect(trendOf('target_share', season, last, noisy).roleChange).toBeNull()
  })

  it('counts carries and targets for the opportunity share', () => {
    const season = row({
      opportunity_share: metric(0.25),
      carries: metric(15),
      targets: metric(10)
    })
    const last = row({ opportunity_share: metric(0.25), carries: metric(5), targets: metric(5) })
    expect(trendOf('opportunity_share', season, last, []).change).toBeCloseTo(0, 9)
  })

  it('flags a value its stability says will fall back', () => {
    const pop = Array.from({ length: 20 }, (_, i) => row({ fpoe: metric(i) }, 10, `p${i}`))
    const stability = new Map([
      [
        'fpoe',
        { yearToYear: 0.2, pairs: 500, splitHalf: 0.3, prior: null, reliability: 'low' as const }
      ]
    ])
    const hot = signalOf('fpoe', pop, pop[19], stability)
    expect(hot.mean).toBeCloseTo(9.5, 9)
    expect(hot.expectedChange).toBeCloseTo(-0.8 * 9.5, 9)
    expect(hot.signal).toBe('hot')
    expect(signalOf('fpoe', pop, pop[0], stability).signal).toBe('cold')
    expect(signalOf('fpoe', pop, pop[10], stability).signal).toBeNull()
    expect(signalOf('fpoe', pop, pop[19], new Map()).signal).toBeNull()
  })

  it('answers for a player, with the rest of his schedule', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
    const ctx = { currentSeason: 2025, hasLeague: false }
    const o = await playerOutlook(db, { player: WR, season: 2025 }, ctx, new Map())
    expect(o).toMatchObject({
      player: WR,
      position: 'WR',
      team: 'BUF',
      games: 1,
      scoring: 'ppr',
      boomRate: 1,
      schedule: { opponents: ['KC'] }
    })
    expect(o.ceiling.season).toBeCloseTo(3, 6)
    // Only the shares the catalogue lists for a WR (the opportunity share is a back's).
    expect(o.trend.map((t) => t.metric)).toEqual([
      'snap_share',
      'route_participation',
      'target_share',
      'carry_share'
    ])
    await expect(playerOutlook(db, { player: 'x', season: 2025 }, ctx, new Map())).rejects.toThrow(
      'gsis id'
    )
    await expect(
      playerOutlook(db, { player: '00-0099999', season: 2025 }, ctx, new Map())
    ).rejects.toThrow('no games')

    const games = await gameForecasts(db, { season: 2025, team: 'BUF' })
    expect(games.map((g) => [g.gameId, g.homeScore, g.awayScore, g.spread])).toEqual([
      ['g1', 27, 20, 2.5],
      ['g2', null, null, -1.5]
    ])
    expect(games[1].homeWinProb).toBeGreaterThan(0)
    await expect(gameForecasts(db, { season: 2025, team: 'buf' })).rejects.toThrow('team code')
  })
})
