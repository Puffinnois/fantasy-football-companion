import { describe, expect, it } from 'vitest'
import { lineupRows, scoreFreeAgents, waiverContext, type ScoredAdd } from '@main/waiver/search'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Releases and totals only: tied optima may start a different player, which changes no number. */
const numbers = (x: ScoredAdd): object[] =>
  x.options.map((o) => ({ release: o.release, delta: o.delta, thisWeekDelta: o.thisWeekDelta }))

describe('waiver search shortcuts are exact (slice 6c spec §10)', () => {
  it.each([1, 2, 3])('seed %i: the pruned search equals brute force', (seed) => {
    const league = generateLeague(seed, 2, 40)
    // One injured player so IR moves are part of the comparison.
    league.teams[0].players[3] = { ...league.teams[0].players[3], injuryStatus: 'Out' }
    const ctx = waiverContext(syntheticBuild(league).build, {
      irSlots: 1,
      irStatuses: ['IR', 'Out']
    })
    const fast = scoreFreeAgents(ctx)
    const brute = scoreFreeAgents(ctx, { skip: false })
    expect(fast.length).toBeGreaterThan(0)
    const bruteById = new Map(brute.map((x) => [x.series.base.playerId, x]))
    for (const x of fast) {
      const b = bruteById.get(x.series.base.playerId)
      expect(b && numbers(b)).toEqual(numbers(x))
    }
    // Skipped free agents could not have helped with any release.
    const kept = new Set(fast.map((x) => x.series.base.playerId))
    for (const b of brute) {
      if (!kept.has(b.series.base.playerId)) expect(b.options[0].delta).toBeLessThanOrEqual(0)
    }
    expect(lineupRows(ctx, fast, Infinity).map((r) => r.player.playerId)).toEqual(
      lineupRows(ctx, brute, Infinity).map((r) => r.player.playerId)
    )
  })
})
