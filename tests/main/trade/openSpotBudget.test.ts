import { describe, expect, it } from 'vitest'
import { tradeOpenSpots } from '@main/trade/openSpot'
import { twoTeam } from '@shared/deal'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Slice 6c spec §10: both sides' open-spot adds for one proposal. */
const OPEN_SPOT_MS = 1000

/** Wall-clock: runs only under `npm run test:budget` (parallel `npm test` workers make it flap). */
describe.skipIf(!process.env.FFC_BUDGET)('open spot budget', () => {
  it('finds a 2-for-1’s open-spot add inside 1 s', () => {
    const league = generateLeague(7, 16, 550)
    const { build } = syntheticBuild(league)
    const [mine, theirs] = league.teams
    // Two of my RBs for one of theirs: my side opens a spot, theirs drops one and stays full.
    const proposal = twoTeam(
      mine.rosterId,
      theirs.rosterId,
      [mine.players[2].id, mine.players[3].id],
      [theirs.players[2].id]
    )
    const t0 = performance.now()
    const spots = tradeOpenSpots(build, proposal)
    const ms = performance.now() - t0
    const [me, them] = spots.sides
    console.info(
      `open spot ${ms.toFixed(0)} ms · me ${me?.add?.fullName ?? '—'} · them ${them ? 'open' : 'full'}`
    )
    expect(me).not.toBeNull()
    expect(ms).toBeLessThan(OPEN_SPOT_MS)
  })
})
