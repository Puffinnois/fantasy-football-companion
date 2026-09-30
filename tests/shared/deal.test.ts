import { describe, expect, it } from 'vitest'
import { dealProblem, dealTeams, type DealMove } from '@shared/deal'

const TEAMS: Record<number, string> = { 1: 'Cook Book', 2: 'Rival', 3: 'Tank Mode' }
const PLAYERS: Record<string, string> = {
  j: 'Justin Jefferson',
  c: "Ja'Marr Chase",
  h: 'Tee Higgins'
}
const team = (id: number): string => TEAMS[id] ?? `Team ${id}`
const player = (id: string): string => PLAYERS[id] ?? id
const m = (playerId: string, from: number, to: number): DealMove => ({ playerId, from, to })
const problem = (teams: number[], moves: DealMove[]): string | null =>
  dealProblem(teams, moves, 1, team, player)

describe('deal rules (multi-team spec §2.1)', () => {
  it('lists the teams in order of first appearance, source before destination', () => {
    expect(dealTeams([m('j', 1, 2), m('c', 2, 3), m('h', 3, 1)])).toEqual([1, 2, 3])
    expect(dealTeams([m('h', 3, 1), m('j', 1, 2)])).toEqual([3, 1, 2])
    expect(dealTeams([])).toEqual([])
  })

  it('accepts 2-team deals, cycles and other shapes', () => {
    expect(problem([1, 2], [m('j', 1, 2), m('c', 2, 1)])).toBeNull()
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 3), m('h', 3, 1)])).toBeNull()
    // not a cycle: I send one player to each team and get one back from each
    expect(problem([1, 2, 3], [m('j', 1, 2), m('x', 1, 3), m('c', 2, 1), m('h', 3, 1)])).toBeNull()
  })

  it('names the first broken rule', () => {
    expect(problem([1], [])).toBe('Pick at least one other team')
    expect(problem([2, 3], [m('c', 2, 3), m('h', 3, 2)])).toBe(
      'Your team must be part of the trade'
    )
    expect(problem([1, 2], [m('j', 1, 2), m('j', 1, 2), m('c', 2, 1)])).toBe(
      'A player can only move once'
    )
    expect(problem([1, 2], [m('j', 1, 1), m('c', 2, 1)])).toBe(
      'Justin Jefferson is already on Cook Book'
    )
    expect(problem([1, 2], [m('j', 1, 2)])).toBe('Cook Book gets nobody')
    expect(problem([1, 2], [m('c', 2, 1)])).toBe('Cook Book sends nobody')
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 1)])).toBe('Tank Mode sends nobody')
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 1), m('h', 3, 1)])).toBe(
      'Tank Mode gets nobody'
    )
  })
})
