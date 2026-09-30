import { describe, expect, it } from 'vitest'
import { evaluateTrade } from '@main/trade/evaluate'
import { afterRoster, openSpotFor, tradeOpenSpots } from '@main/trade/openSpot'
import type { PlayerSeries } from '@main/value/series'
import { twoTeam } from '@shared/deal'
import type { TradeProposal } from '@shared/types'
import {
  SMALL_LEAGUE,
  syntheticBuild,
  WAIVER_LEAGUE,
  waiverLeagueWith
} from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }
const ids = (roster: PlayerSeries[]): string[] => roster.map((s) => s.base.playerId).sort()

describe('trade open spot (slice 6c spec §7)', () => {
  it('finds the best free agent for each side a trade leaves short', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const [me, them] = tradeOpenSpots(build, twoTeam(1, 2, ['C', 'D'], ['R2'])).sides
    expect(me).toMatchObject({ rosterId: 1, deltaPerWeek: 2.5 })
    expect(me?.add).toMatchObject({ playerId: 'Y', starterWeeks: 0 })
    expect(them).toMatchObject({ rosterId: 2, deltaPerWeek: 10 })
    expect(them?.add?.playerId).toBe('Y')
  })

  it('reads the after-roster from the evaluation, auto-drops included', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const proposal = twoTeam(1, 2, ['D'], ['R1', 'R2'])
    const [mine, theirs] = evaluateTrade(build, proposal).sides
    expect(mine.drops).toHaveLength(1)
    const dropped = mine.drops[0].playerId
    expect(ids(afterRoster(build, mine))).toEqual(
      ['A', 'B', 'C', 'R1', 'R2'].filter((id) => id !== dropped)
    )
    expect(ids(afterRoster(build, theirs))).toEqual(['D'])
    const spots = tradeOpenSpots(build, proposal).sides
    expect(spots[0]).toBeNull()
    expect(spots[1]).toMatchObject({ rosterId: 2, deltaPerWeek: 14 })
    expect(spots[1]?.add?.playerId).toBe('Y')
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

  it('handles a 3-team deal where one side drops and another is left short', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const proposal: TradeProposal = {
      moves: [
        { playerId: 'B', to: 2 },
        { playerId: 'D', to: 2 },
        { playerId: 'G', to: 3 },
        { playerId: 'I', to: 1 }
      ]
    }
    const [me, rival, other] = evaluateTrade(build, proposal).sides
    // Me ends with A, C, I: RB A20 · WR I25 · FLEX C18 = 63 a week (was 46)
    expect(me.delta).toBe(34)
    expect(me.drops).toEqual([])
    // Rival holds F, E, H, B, D (5 > 4): B and D never start, the tie breaks on lower ROS points
    expect(rival.drops.map((s) => s.playerId)).toEqual(['D'])
    // F, E, H, B = 39 a week (was 43)
    expect(rival.delta).toBe(-8)
    // Other ends with J, K, L, G: RB G7 · WR K6 · FLEX L9 = 22 a week (was 38)
    expect(other.delta).toBe(-32)
    // Me is one short but no free agent exists; Rival is full after its drop; Other is full
    expect(tradeOpenSpots(build, proposal).sides).toEqual([
      { rosterId: 1, add: null, deltaPerWeek: 0 },
      null,
      null
    ])
  })

  it('is null for a full roster or an unknown roster size', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const mine = build.rosters.get(1) ?? []
    expect(openSpotFor(build, [16, 17], 1, mine)).toBeNull()
    const blind = { ...build, inputs: { ...build.inputs, rosterPositions: null } }
    expect(openSpotFor(blind, [16, 17], 1, mine.slice(0, 3))).toBeNull()
  })
})
