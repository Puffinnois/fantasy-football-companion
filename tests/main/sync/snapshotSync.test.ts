import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { listRosSnapshot } from '@main/db/repos/rosSnapshots'
import { setNflState } from '@main/db/repos/state'
import type { SleeperClient } from '@main/sources/sleeper'
import { snapshotRos, sourceRosSnapshot } from '@main/sync/snapshotSync'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

describe('snapshotRos', () => {
  let db: Db
  const deps = (): Parameters<typeof snapshotRos>[0] => ({
    db,
    sleeper: {} as SleeperClient,
    now: () => new Date(SEED_TS)
  })
  const state = (seasonType: string): void =>
    setNflState(db, {
      season: String(SEASON),
      week: 3,
      displayWeek: 3,
      seasonType,
      fetchedAt: SEED_TS
    })

  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it("stores the current week's snapshot as one logged step", async () => {
    state('regular')
    const { steps } = await snapshotRos(deps())
    expect(steps).toEqual([
      expect.objectContaining({ source: sourceRosSnapshot(SEASON), status: 'ok' })
    ])
    expect(listRosSnapshot(db, SEASON, 3).length).toBeGreaterThan(0)
  })

  it('does nothing outside the regular season', async () => {
    state('off')
    expect((await snapshotRos(deps())).steps).toEqual([])
  })
})
