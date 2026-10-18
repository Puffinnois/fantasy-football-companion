import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { runQuery } from '@main/stats/engine/run'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

describe('counted components that a player never had (Plan Y follow-up)', () => {
  it('sum as 0, so a receiver without carries has an opportunity share and touches', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['opportunity_share', 'touches', 'scrimmage_yds'],
        scope: { seasons: [2025], players: [WR] }
      },
      CTX
    )
    // Two targets of BUF's three targets and one carry; one reception for 20 yards.
    expect(r.rows[0].values.opportunity_share.value).toBeCloseTo(2 / 3, 9)
    expect(r.rows[0].values.touches.value).toBe(1)
    expect(r.rows[0].values.scrimmage_yds.value).toBe(20)
  })
})
