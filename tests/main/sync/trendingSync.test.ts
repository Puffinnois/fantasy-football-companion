import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listTrendingAdds, replaceTrendingAdds, trendingFetchedAt } from '@main/db/repos/trending'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncDeps } from '@main/sync/step'
import { mapTrending, refreshTrending, SOURCE_TRENDING } from '@main/sync/trendingSync'

const T0 = '2026-09-20T08:00:00.000Z'
const T = '2026-09-22T10:00:00.000Z'

describe('refreshTrending (slice 6c spec §5.1)', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })
  const deps = (getTrendingAdds: SleeperClient['getTrendingAdds']): SyncDeps => ({
    db,
    sleeper: { getTrendingAdds } as unknown as SleeperClient,
    now: () => new Date(T)
  })

  it('replaces the stored list with the latest fetch, as one logged step', async () => {
    replaceTrendingAdds(db, [{ playerId: 'old', count: 1 }], T0)
    const { steps } = await refreshTrending(
      deps(async () => [
        { player_id: '4866', count: 1200 },
        { player_id: '9509', count: 40 }
      ])
    )
    expect(steps).toEqual([expect.objectContaining({ source: SOURCE_TRENDING, status: 'ok' })])
    expect(listTrendingAdds(db)).toEqual(
      new Map([
        ['4866', 1200],
        ['9509', 40]
      ])
    )
    expect(trendingFetchedAt(db)).toBe(T)
  })

  it('keeps the previous list when Sleeper fails', async () => {
    replaceTrendingAdds(db, [{ playerId: '4866', count: 5 }], T0)
    const { steps } = await refreshTrending(
      deps(async () => {
        throw new Error('Sleeper 503')
      })
    )
    expect(steps[0]).toMatchObject({ source: SOURCE_TRENDING, status: 'error' })
    expect(listTrendingAdds(db)).toEqual(new Map([['4866', 5]]))
    expect(trendingFetchedAt(db)).toBe(T0)
  })

  it('drops malformed rows', () => {
    expect(
      mapTrending([
        { player_id: '', count: 3 },
        { player_id: '1', count: Number.NaN },
        { player_id: '2', count: 7 }
      ])
    ).toEqual([{ playerId: '2', count: 7 }])
  })

  it('reports no fetch time before the first fetch', () => {
    expect(trendingFetchedAt(db)).toBeNull()
  })
})
