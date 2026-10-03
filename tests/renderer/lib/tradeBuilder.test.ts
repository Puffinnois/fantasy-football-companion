import { describe, expect, it } from 'vitest'
import {
  EMPTY_DEAL,
  addPick,
  addTeam,
  builderProblem,
  dealMoves,
  dealOf,
  destinationOf,
  getsLine,
  proposalFrom,
  pruneDeal,
  removePick,
  removeTeam,
  setDestination,
  sidesInOrder,
  teamLabel,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import { bijan, higgins, threeTeamEvaluation, threeTeamPool, tradePool } from '../../fixtures/trade'

const pool = threeTeamPool()
/** Jefferson → Rival (default), Chase → Tank Mode (picked), Higgins → me (default). */
const cycle: BuilderDeal = {
  teams: [2, 3],
  picks: [
    { playerId: '6794', from: 1, to: null },
    { playerId: '7564', from: 2, to: 3 },
    { playerId: '5859', from: 3, to: null }
  ]
}

describe('trade builder deal (multi-team spec §5.1)', () => {
  it("sends my players to the first other team and everyone else's to me by default", () => {
    expect(cycle.picks.map((p) => destinationOf(cycle, p, 1))).toEqual([2, 3, 1])
    expect(proposalFrom(cycle, 1)).toEqual({
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '7564', to: 3 },
        { playerId: '5859', to: 1 }
      ]
    })
    // with no other team my players have nowhere to go yet: left out of the moves
    const alone: BuilderDeal = { teams: [], picks: [{ playerId: '6794', from: 1, to: null }] }
    expect(destinationOf(alone, alone.picks[0], 1)).toBeNull()
    expect(dealMoves(alone, 1)).toEqual([])
  })

  it('adds and removes teams and players', () => {
    let deal = addTeam(EMPTY_DEAL, 2)
    expect(addTeam(deal, 2)).toBe(deal)
    deal = addPick(deal, '6794', 1)
    expect(addPick(deal, '6794', 1)).toBe(deal)
    deal = setDestination(addPick(addTeam(deal, 3), '5859', 3), '5859', 2)
    expect(deal).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '5859', from: 3, to: 2 }
      ]
    })
    expect(removePick(deal, '6794').picks.map((p) => p.playerId)).toEqual(['5859'])
  })

  it('drops what a removed team sends and re-targets what was headed to it', () => {
    expect(removeTeam(cycle, 3)).toEqual({
      teams: [2],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '7564', from: 2, to: null }
      ]
    })
    // removing the last other team keeps my picks, waiting for a destination
    expect(removeTeam(removeTeam(cycle, 3), 2)).toEqual({
      teams: [],
      picks: [{ playerId: '6794', from: 1, to: null }]
    })
  })

  it('opens an evaluation as a deal', () => {
    expect(dealOf(threeTeamEvaluation())).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: 2 },
        { playerId: '7564', from: 2, to: 3 },
        { playerId: '5859', from: 3, to: 1 }
      ]
    })
  })

  it('keeps what still exists after a sync', () => {
    // Tank Mode gone: its pick leaves, Chase heads back to me
    expect(pruneDeal(cycle, tradePool())).toEqual({
      teams: [2],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '7564', from: 2, to: null }
      ]
    })
    // Chase no longer on Rival
    const moved = tradePool({
      teams: [
        { rosterId: 2, name: 'Rival', players: [bijan] },
        { rosterId: 3, name: 'Tank Mode', players: [higgins] }
      ]
    })
    expect(pruneDeal(cycle, moved).picks.map((p) => p.playerId)).toEqual(['6794', '5859'])
  })

  it("checks the deal with the main process's rule", () => {
    expect(builderProblem(cycle, pool)).toBeNull()
    expect(builderProblem(EMPTY_DEAL, pool)).toBe('Pick at least one other team')
    expect(
      builderProblem({ teams: [2], picks: [{ playerId: '6794', from: 1, to: null }] }, pool)
    ).toBe('Cook Book gets nobody')
    expect(
      builderProblem(
        {
          teams: [2, 3],
          picks: [
            { playerId: '6794', from: 1, to: null },
            { playerId: '7564', from: 2, to: null }
          ]
        },
        pool
      )
    ).toBe('Tank Mode sends nobody')
  })

  it('writes the gets line, naming sources only with three teams or more', () => {
    expect(getsLine(cycle, 1, pool)).toBe('gets: Tee Higgins (Tank Mode)')
    expect(getsLine(cycle, 2, pool)).toBe('gets: Justin Jefferson (Me)')
    const two: BuilderDeal = { teams: [2], picks: [{ playerId: '6794', from: 1, to: null }] }
    expect(getsLine(two, 2, pool)).toBe('gets: Justin Jefferson')
    expect(getsLine(two, 1, pool)).toBe('gets: nobody')
    expect(teamLabel(pool, 1)).toBe('Me')
    expect(teamLabel(pool, 3)).toBe('Tank Mode')
  })
})

describe('sidesInOrder (Plan Q follow-up)', () => {
  it('orders verdict columns as the builder orders its cards', () => {
    const ev = threeTeamEvaluation() // me (1), Rival (2), Tank Mode (3)
    const ids = (deal: BuilderDeal): number[] => sidesInOrder(ev, deal, 1).map((s) => s.rosterId)
    expect(ids({ teams: [3, 2], picks: [] })).toEqual([1, 3, 2])
    expect(ids({ teams: [2, 3], picks: [] })).toEqual([1, 2, 3])
    // a side whose team is not in the row (cannot happen on screen) goes last
    expect(ids({ teams: [3], picks: [] })).toEqual([1, 3, 2])
  })
})
