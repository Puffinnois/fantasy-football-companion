import { describe, expect, it } from 'vitest'
import { waiverAdds } from '@main/waiver/adds'
import { scoreFreeAgents, waiverContext } from '@main/waiver/search'
import { stashRows } from '@main/waiver/stash'
import type { AddOption } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import { syntheticBuild, WAIVER_LEAGUE } from '../../fixtures/synthetic'

const trending = new Map([
  ['Z', 120],
  ['W', 40]
])
const summary = (options: AddOption[]): [string, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.delta
  ])

describe('stash (slice 6c spec §3)', () => {
  const ctx = waiverContext(syntheticBuild(WAIVER_LEAGUE).build, {})
  const scored = scoreFreeAgents(ctx)

  it('lists free agents with a signal and no lineup gain, in market order', () => {
    const rows = stashRows(ctx, scored, trending)
    // X and Y improve the lineup; Q has no signal; R1 / R2 are rostered.
    expect(rows.map((r) => r.player.playerId)).toEqual(['K', 'Z', 'W'])
    expect(rows.map((r) => r.trending)).toEqual([null, 120, 40])
    expect(rows[2].player.expert?.ecrRank).toBe(5)
  })

  it('scores what making room costs for each', () => {
    const rows = stashRows(ctx, scored, trending)
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 0],
      ['drop C', -6],
      ['drop B', -10],
      ['drop A', -22]
    ])
    expect(summary(rows[1].options)).toEqual([
      ['drop D', 0],
      ['drop B', -10],
      ['drop C', -14],
      ['drop A', -30]
    ])
  })

  it('shortlists the top of each signal, so any sort shows a full list', () => {
    // top 1 by market = K, by trending = Z, by rank = W
    expect(
      stashRows(ctx, scored, trending, 1)
        .map((r) => r.player.playerId)
        .sort()
    ).toEqual(['K', 'W', 'Z'])
  })
})

describe('waiverAdds (spec §6)', () => {
  it('assembles the rest-of-season payload', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const adds = waiverAdds(build, {
      settings: { waiverType: 'priority' },
      trending,
      trendingFetchedAt: '2026-09-22T10:00:00.000Z'
    })
    expect(adds).toMatchObject({
      season: SEASON,
      currentWeek: 16,
      lastWeek: 17,
      weeks: 2,
      waiverType: 'priority',
      myWaiverPosition: 2,
      teamCount: 2,
      trendingFetchedAt: '2026-09-22T10:00:00.000Z'
    })
    expect(adds.lineup.map((r) => r.player.playerId)).toEqual(['Y', 'X'])
    expect(adds.stash.map((r) => r.player.playerId)).toEqual(['K', 'Z', 'W'])
  })
})
