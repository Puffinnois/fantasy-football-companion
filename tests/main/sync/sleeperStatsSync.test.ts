import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@main/db/connection'
import { saveRules } from '@main/db/repos/rules'
import { listSleeperStatsByWeek } from '@main/db/repos/sleeperStats'
import { setNflState } from '@main/db/repos/state'
import type { SyncDeps } from '@main/sync/step'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SleeperStatRow } from '@main/sources/sleeper-types'
import {
  refreshSleeperStats,
  scoresIdp,
  sourceSleeperStats,
  STATS_UNAVAILABLE,
  statsWeeks
} from '@main/sync/sleeperStatsSync'
import type { NflState } from '@shared/types'
import { seedLeague } from '../../fixtures/db'
import { rules } from '../../fixtures/rules'
import * as fx from '../../fixtures/sleeper'

const HOUR = 3_600_000
const DAY = 24 * HOUR

const state = (over: Partial<NflState> = {}): NflState => ({
  season: '2026',
  week: 4,
  displayWeek: 4,
  seasonType: 'regular',
  fetchedAt: '2026-10-01T12:00:00.000Z',
  ...over
})

describe('statsWeeks (Sleeper stats scoring spec §3.1)', () => {
  const all = Array.from({ length: 18 }, (_, i) => i + 1)
  it('a past season has every week; the current one runs through the state week', () => {
    expect(statsWeeks(2025, state())).toEqual(all)
    expect(statsWeeks(2026, state())).toEqual([1, 2, 3, 4])
    expect(statsWeeks(2026, state({ week: 22 }))).toEqual(all)
  })
  it('every week after the regular season, none before it', () => {
    expect(statsWeeks(2026, state({ seasonType: 'post', week: 1 }))).toEqual(all)
    expect(statsWeeks(2026, state({ seasonType: 'off', week: 1 }))).toEqual(all)
    expect(statsWeeks(2026, state({ seasonType: 'pre', week: 0 }))).toEqual([])
  })
})

describe('scoresIdp', () => {
  it('is true when base or position scoring pays an idp_ key', () => {
    expect(scoresIdp(null)).toBe(false)
    expect(scoresIdp(rules())).toBe(false)
    expect(scoresIdp(rules({ scoring: { ...rules().scoring, idp_tkl: 0 } }))).toBe(false)
    expect(scoresIdp(rules({ scoring: { ...rules().scoring, idp_sack: 2 } }))).toBe(true)
    expect(scoresIdp(rules({ positionOverrides: { DEF: { idp_tkl: 1 } } }))).toBe(true)
  })
})

describe('refreshSleeperStats (spec §3.3)', () => {
  let db: Db
  let clock: Date
  let getStats: ReturnType<typeof vi.fn<SleeperClient['getStats']>>

  /** Week 4 of 2026 is the captured week; every other week answers with no rows. */
  const answer = async (season: string, week: number): Promise<SleeperStatRow[] | null> =>
    season === '2026' && week === 4 ? fx.statsWeek4 : []
  const deps = (): SyncDeps => ({
    db,
    sleeper: { getStats } as unknown as SleeperClient,
    now: () => clock
  })
  const ran = (steps: { source: string; status: string }[]): string[] =>
    steps.filter((s) => s.status === 'ok').map((s) => s.source)

  beforeEach(() => {
    db = seedLeague()
    clock = new Date('2026-10-01T12:00:00.000Z')
    setNflState(db, state())
    getStats = vi.fn(answer)
  })

  it('fetches the prior season, then the current one through the state week, and stores the rows', async () => {
    const result = await refreshSleeperStats(deps())
    expect(result.steps.map((s) => s.source)).toEqual([
      ...Array.from({ length: 18 }, (_, i) => sourceSleeperStats(2025, i + 1)),
      ...[1, 2, 3, 4].map((w) => sourceSleeperStats(2026, w))
    ])
    expect(result.steps.every((s) => s.status === 'ok')).toBe(true)
    expect(getStats).toHaveBeenCalledWith('2026', 4, false)
    expect(listSleeperStatsByWeek(db, 2026, 4).map((r) => r.playerId)).toContain('LAR')
    expect(result.steps.at(-1)).toMatchObject({ rowsWritten: 8 })
  })

  it('asks for IDP rows when the league scores an idp_ key', async () => {
    saveRules(db, 'L1', rules({ scoring: { ...rules().scoring, idp_sack: 2 } }))
    await refreshSleeperStats(deps())
    expect(getStats).toHaveBeenCalledWith('2026', 4, true)
  })

  it('re-runs the state week and the one before after 6 h, the season after 7 days, the prior season after 30', async () => {
    await refreshSleeperStats(deps())
    clock = new Date(clock.getTime() + HOUR)
    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual([])
    clock = new Date(clock.getTime() + 6 * HOUR)
    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual([
      sourceSleeperStats(2026, 3),
      sourceSleeperStats(2026, 4)
    ])
    clock = new Date(clock.getTime() + 7 * DAY)
    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual(
      [1, 2, 3, 4].map((w) => sourceSleeperStats(2026, w))
    )
    clock = new Date(clock.getTime() + 30 * DAY)
    expect(ran((await refreshSleeperStats(deps())).steps)).toHaveLength(22)
  })

  it('a forced refresh re-runs only the two recent weeks', async () => {
    await refreshSleeperStats(deps())
    clock = new Date(clock.getTime() + 60_000)
    expect(ran((await refreshSleeperStats(deps(), { force: true })).steps)).toEqual([
      sourceSleeperStats(2026, 3),
      sourceSleeperStats(2026, 4)
    ])
  })

  it('stops after one request when the endpoint is gone', async () => {
    getStats = vi.fn(async () => null)
    const result = await refreshSleeperStats(deps())
    expect(result.steps).toEqual([
      expect.objectContaining({
        source: sourceSleeperStats(2025, 1),
        status: 'skipped',
        message: STATS_UNAVAILABLE
      })
    ])
    expect(getStats).toHaveBeenCalledTimes(1)
  })

  it('does nothing without an NFL state', async () => {
    db.exec('DELETE FROM nfl_state')
    expect((await refreshSleeperStats(deps())).steps).toEqual([])
  })
})
