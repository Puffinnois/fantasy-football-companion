import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@main/db/connection'
import { listMatchups } from '@main/db/repos/matchups'
import { setNflState } from '@main/db/repos/state'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SleeperMatchup } from '@main/sources/sleeper-types'
import {
  mapMatchups,
  MATCHUPS_PAST_FRESHNESS_MS,
  refreshMatchups,
  sourceMatchups
} from '@main/sync/matchupsSync'
import type { SyncDeps } from '@main/sync/step'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/sleeper'

const T0 = new Date('2026-09-20T12:00:00.000Z')

function deps(db: Db, getMatchups: SleeperClient['getMatchups'], now = T0): SyncDeps {
  return { db, sleeper: { getMatchups } as unknown as SleeperClient, now: () => now }
}

const byWeek = vi.fn(async (_l: string, week: number) => fx.matchups(week))

describe('mapMatchups', () => {
  it('keeps slot order, defaults missing arrays and points', () => {
    const items: SleeperMatchup[] = [
      { roster_id: 3, matchup_id: null, starters: null, players: null, points: null },
      ...fx.matchups(1)
    ]
    expect(mapMatchups(items)[0]).toEqual({
      rosterId: 3,
      matchupId: null,
      starters: [],
      players: [],
      points: 0
    })
    expect(mapMatchups(items)[1]).toEqual({
      rosterId: 1,
      matchupId: 1,
      starters: ['4866', '6794', '0', 'LAR'],
      players: ['4866', '6794', '8259', 'LAR'],
      points: 101
    })
  })
})

describe('refreshMatchups', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    setNflState(db, {
      season: '2026',
      week: 3,
      displayWeek: 3,
      seasonType: 'regular',
      fetchedAt: SEED_TS
    })
    byWeek.mockClear()
  })

  it('fetches all 18 weeks the first time, stores them and reports the counts', async () => {
    const getMatchups = vi.fn(async (_l: string, week: number) =>
      week <= 15 ? fx.matchups(week) : []
    )
    const entry = await refreshMatchups(deps(db, getMatchups), 'L1', false)
    expect(entry).toMatchObject({ source: sourceMatchups(2026), status: 'ok', rowsWritten: 18 })
    expect(entry.message).toBe('18 weeks fetched, 2 teams')
    expect(getMatchups).toHaveBeenCalledTimes(18)
    const rows = listMatchups(db, 'L1', 2026)
    expect(rows).toHaveLength(30)
    expect(rows.find((r) => r.week === 2 && r.rosterId === 1)).toMatchObject({
      points: 102,
      updatedAt: T0.toISOString()
    })
  })

  it('skips fresh past weeks, always refetches the current and future weeks', async () => {
    await refreshMatchups(deps(db, byWeek), 'L1', false)
    const second = vi.fn(async (_l: string, week: number) => fx.matchups(week))
    const later = new Date(T0.getTime() + 60 * 60 * 1000)
    const entry = await refreshMatchups(deps(db, second, later), 'L1', false)
    expect(second.mock.calls.map((c) => c[1])).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18
    ])
    expect(entry.message).toBe('16 weeks fetched, 2 teams')
    const stale = new Date(T0.getTime() + MATCHUPS_PAST_FRESHNESS_MS + 1)
    const third = vi.fn(async (_l: string, week: number) => fx.matchups(week))
    await refreshMatchups(deps(db, third, stale), 'L1', false)
    expect(third).toHaveBeenCalledTimes(18)
  })

  it('force refetches everything and an empty answer clears a stored week', async () => {
    await refreshMatchups(deps(db, byWeek), 'L1', false)
    const empty = vi.fn(async (_l: string, week: number) => (week === 1 ? [] : fx.matchups(week)))
    await refreshMatchups(deps(db, empty), 'L1', true)
    expect(empty).toHaveBeenCalledTimes(18)
    expect(listMatchups(db, 'L1', 2026).some((r) => r.week === 1)).toBe(false)
  })

  it('records a failed step and keeps what was stored so far', async () => {
    const failing = vi.fn(async (_l: string, week: number) => {
      if (week === 4) throw new Error('boom')
      return fx.matchups(week)
    })
    const entry = await refreshMatchups(deps(db, failing), 'L1', false)
    expect(entry.status).toBe('error')
    expect(entry.message).toBe('boom')
    expect(listMatchups(db, 'L1', 2026).map((r) => r.week)).toEqual([1, 1, 2, 2, 3, 3])
  })
})
