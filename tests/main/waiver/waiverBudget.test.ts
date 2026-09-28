import { describe, expect, it } from 'vitest'
import { waiverAdds } from '@main/waiver/adds'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Slice 6c spec §10: the rest-of-season lists on a league the size of the user's. */
const ADDS_MS = 3000

/** Wall-clock: runs only under `npm run test:budget` (parallel `npm test` workers make it flap). */
describe.skipIf(!process.env.FFC_BUDGET)('waiver adds budget', () => {
  it('scores 16 teams and 550 free agents inside 3 s', () => {
    const { build } = syntheticBuild(generateLeague(7, 16, 550))
    const t0 = performance.now()
    const adds = waiverAdds(build, {
      settings: { waiverType: 'priority' },
      trending: new Map(),
      trendingFetchedAt: null
    })
    const ms = performance.now() - t0
    console.info(
      `waiver adds ${ms.toFixed(0)} ms · ${adds.lineup.length} lineup · ${adds.stash.length} stash`
    )
    expect(ms).toBeLessThan(ADDS_MS)
  })
})
