import { describe, expect, it } from 'vitest'
import { evaluateTrade } from '@main/trade/evaluate'
import { afterRoster, openSpotFor, tradeOpenSpots } from '@main/trade/openSpot'
import type { PlayerSeries } from '@main/value/series'
import { syntheticBuild, WAIVER_LEAGUE, waiverLeagueWith } from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }
const ids = (roster: PlayerSeries[]): string[] => roster.map((s) => s.base.playerId).sort()

describe('trade open spot (slice 6c spec §7)', () => {
  it('finds the best free agent for each side a trade leaves short', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const spots = tradeOpenSpots(build, { rosterId: 2, give: ['C', 'D'], get: ['R2'] })
    expect(spots.me).toMatchObject({ rosterId: 1, deltaPerWeek: 2.5 })
    expect(spots.me?.add).toMatchObject({ playerId: 'Y', starterWeeks: 0 })
    expect(spots.them).toMatchObject({ rosterId: 2, deltaPerWeek: 10 })
    expect(spots.them?.add?.playerId).toBe('Y')
  })

  it('reads the after-roster from the evaluation, auto-drops included', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const proposal = { rosterId: 2, give: ['D'], get: ['R1', 'R2'] }
    const ev = evaluateTrade(build, proposal)
    expect(ev.me.drops).toHaveLength(1)
    const dropped = ev.me.drops[0].playerId
    expect(ids(afterRoster(build, ev.me))).toEqual(
      ['A', 'B', 'C', 'R1', 'R2'].filter((id) => id !== dropped)
    )
    expect(ids(afterRoster(build, ev.them))).toEqual(['D'])
    const spots = tradeOpenSpots(build, proposal)
    expect(spots.me).toBeNull()
    expect(spots.them).toMatchObject({ rosterId: 2, deltaPerWeek: 14 })
    expect(spots.them?.add?.playerId).toBe('Y')
  })

  it('names no add when no free agent helps the open spot', () => {
    const league = {
      ...waiverLeagueWith([A, C, B]),
      freeAgents: WAIVER_LEAGUE.freeAgents?.filter((p) => ['Z', 'W', 'Q'].includes(p.id))
    }
    const { build } = syntheticBuild(league)
    expect(openSpotFor(build, [16, 17], 1, build.rosters.get(1) ?? [])).toEqual({
      rosterId: 1,
      add: null,
      deltaPerWeek: 0
    })
  })

  it('is null for a full roster or an unknown roster size', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const mine = build.rosters.get(1) ?? []
    expect(openSpotFor(build, [16, 17], 1, mine)).toBeNull()
    const blind = { ...build, inputs: { ...build.inputs, rosterPositions: null } }
    expect(openSpotFor(blind, [16, 17], 1, mine.slice(0, 3))).toBeNull()
  })
})
