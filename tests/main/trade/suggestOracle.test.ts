import { describe, expect, it } from 'vitest'
import { windowWeeks } from '@main/lineup/build'
import { collectDeals } from '@main/trade/suggest'
import type { TradeFocus, TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  SMALL_LEAGUE,
  searchLeague,
  syntheticBuild,
  TRIANGLE_LEAGUE
} from '../../fixtures/synthetic'
import { oracleSuggest } from './suggestOracle'

const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  maxTeams: 2,
  mustInclude: null,
  ...over
})
/** "a2→b2@2": my give ids, my get ids, the team I get from. */
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  const sides = s.evaluation.sides
  return `${ids(sides[0].give)}→${ids(sides[0].get)}@${sides[sides.length - 1].rosterId}`
}

describe('the oracle at two teams agrees with the search', () => {
  it('matches the search on the small league', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const focuses: TradeFocus[] = [null, { give: 'C' }, { give: 'D' }, { want: 'WR' }]
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      for (const focus of focuses) {
        for (const mustInclude of [null, 2, 3]) {
          const q = query({ stance, focus, mustInclude })
          expect({ q, out: oracleSuggest(build, q) }).toEqual({
            q,
            out: collectDeals(build, q).cards
          })
        }
      }
    }
  })

  it('matches the search on random leagues, ties included', () => {
    for (const seed of [1, 2, 3]) {
      const { build } = syntheticBuild(searchLeague(seed))
      expect(windowWeeks(build)).toEqual([3, 4, 5])
      for (const stance of ['premium', 'fair', 'overpay'] as const) {
        const q = query({ stance })
        expect({ seed, stance, out: oracleSuggest(build, q, { max: 1000 }) }).toEqual({
          seed,
          stance,
          out: collectDeals(build, q, { max: 1000 }).cards
        })
      }
    }
  })
})

describe('the oracle beyond two teams', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)
  const a2b2 = (list: TradeSuggestion[]): TradeSuggestion | undefined =>
    list.find((s) => shape(s) === 'a2→b2@2')

  it('reaches a2 for b2 through Three, with the other ways in order', () => {
    const card = a2b2(oracleSuggest(build, query({ maxTeams: 3 })))
    expect(card?.teams).toBe(3)
    expect(card?.evaluation.sides.map((s) => [s.name, s.deltaPerWeek])).toEqual([
      ['Me', 10],
      ['Three', 10],
      ['Two', 10]
    ])
    expect(card?.acceptance).toEqual([null, 'both', 'lineup'])
    expect(card?.alternatives.map((a) => [a.label, a.worstDeltaPerWeek])).toEqual([
      ['via Three: c2, c3', 10],
      ['via Three: c1', 4],
      ['via Three: c1, c3', 4]
    ])
  })

  it('does not offer it at two teams', () => {
    expect(a2b2(oracleSuggest(build, query({ maxTeams: 2 })))).toBeUndefined()
  })
})
