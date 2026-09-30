import { describe, expect, it } from 'vitest'
import { waiverContext } from '@main/waiver/search'
import { streamRows } from '@main/waiver/stream'
import { streamWeeks } from '@shared/rules'
import type { StreamRow } from '@shared/types'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Releases and numbers only: tied optima may start a different player, which changes no number. */
const numbers = (rows: StreamRow[]): object[] =>
  rows.map((r) => ({
    id: r.player.playerId,
    options: r.options.map((o) => ({
      release: o.release,
      weekGain: o.weekGain,
      restCost: o.restCost,
      net: o.net
    }))
  }))

describe('streaming shortcuts are exact (slice 6c spec §10)', () => {
  it.each([1, 2, 3])('seed %i: every pickable week equals brute force', (seed) => {
    const league = generateLeague(seed, 2, 40)
    // One injured player so IR moves are part of the comparison.
    league.teams[0].players[3] = { ...league.teams[0].players[3], injuryStatus: 'Out' }
    const ctx = waiverContext(syntheticBuild(league).build, {
      irSlots: 1,
      irStatuses: ['IR', 'Out']
    })
    const { currentWeek, lastWeek } = ctx.build.inputs.value.context
    let listed = 0
    for (const week of streamWeeks(currentWeek, lastWeek)) {
      const fast = streamRows(ctx, week, new Map())
      expect(numbers(fast)).toEqual(numbers(streamRows(ctx, week, new Map(), { skip: false })))
      listed += fast.length
    }
    // Not vacuous: some streamer beats the lineup in some week.
    expect(listed).toBeGreaterThan(0)
  })
})
