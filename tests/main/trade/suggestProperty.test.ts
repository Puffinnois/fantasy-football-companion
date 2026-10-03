import { describe, expect, it } from 'vitest'
import { collectDeals, suggestDeals, type DealEvent } from '@main/trade/suggest'
import type { TradeEvaluation, TradeFocus, TradeStance, TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  NEGATIVE_LEAGUE,
  negativeSearchLeague,
  searchLeague,
  syntheticBuild,
  type SyntheticLeague
} from '../../fixtures/synthetic'
import { oracleSuggest } from './suggestOracle'

/**
 * Seeds picked so no league is vacuous: of the 54 queries each runs, seed 2 gave no card at all
 * with positive values, while these give cards (positive 19 / 33 / 54, with 3- and 4-team cards
 * on seed 8; negative 30 / 28 / 44).
 */
const POSITIVE_SEEDS = [1, 3, 8]
const NEGATIVE_SEEDS = [1, 2, 3]
const STANCE_LIST: TradeStance[] = ['premium', 'fair', 'overpay']
/**
 * Negative values break the optimum's monotonicity: the prunes must stay exact there too.
 * `negativeSearchLeague` is a regression net; `NEGATIVE_LEAGUE` is the fixture where a missing
 * negative-value guard actually changes the answer. `multi`: the league must also yield a card
 * of 3+ teams (`NEGATIVE_LEAGUE` yields 2-team cards only, by design).
 */
const CASES: [string, SyntheticLeague, boolean][] = [
  ...POSITIVE_SEEDS.map((seed): [string, SyntheticLeague, boolean] => [
    `positive values, seed ${seed}`,
    searchLeague(seed),
    true
  ]),
  ...NEGATIVE_SEEDS.map((seed): [string, SyntheticLeague, boolean] => [
    `negative values, seed ${seed}`,
    negativeSearchLeague(seed),
    true
  ]),
  ['hand-built negative values', NEGATIVE_LEAGUE, false]
]

describe('suggestDeals equals the brute force (spec §7)', () => {
  it.each(CASES)(
    '%s: every team count, stance, focus and must-include',
    (_label, league, wantsMulti) => {
      const { build } = syntheticBuild(league)
      let withCards = 0
      let multiTeam = 0
      const cache = new Map<string, TradeEvaluation>()
      const mine = build.rosters.get(1) ?? []
      const focuses: TradeFocus[] = [null, { give: mine[0].base.playerId }, { want: 'WR' }]
      for (const maxTeams of [2, 3, 4]) {
        for (const stance of STANCE_LIST) {
          for (const focus of focuses) {
            for (const mustInclude of [null, 3]) {
              const query: TradeSuggestQuery = {
                season: SEASON,
                focus,
                stance,
                maxTeams,
                mustInclude
              }
              const expected = oracleSuggest(build, query, { cache })
              if (expected.length > 0) withCards++
              if (expected.some((card) => card.teams >= 3)) multiTeam++
              expect({ query, cards: collectDeals(build, query).cards }).toEqual({
                query,
                cards: expected
              })
              // The early stop: a capped run is exactly the head of the full list.
              expect({ query, cards: collectDeals(build, query, { max: 2 }).cards }).toEqual({
                query,
                cards: expected.slice(0, 2)
              })
            }
          }
        }
      }
      // Guards the league: an empty answer in every query would make the equality above vacuous.
      expect(withCards).toBeGreaterThan(0)
      if (wantsMulti) expect(multiTeam).toBeGreaterThan(0)
    },
    180_000
  )

  it('exercises deals beyond two teams and alternatives', () => {
    // Guards the fixture: if it ever stops producing these, pick other POSITIVE_SEEDS.
    let multi = 0
    let alternatives = 0
    for (const seed of POSITIVE_SEEDS) {
      const { build } = syntheticBuild(searchLeague(seed))
      for (const stance of STANCE_LIST) {
        const query: TradeSuggestQuery = {
          season: SEASON,
          focus: null,
          stance,
          maxTeams: 4,
          mustInclude: null
        }
        for (const card of collectDeals(build, query).cards) {
          if (card.teams > 2) multi++
          alternatives += card.alternatives.length
        }
      }
    }
    expect(multi).toBeGreaterThan(0)
    expect(alternatives).toBeGreaterThan(0)
  }, 60_000)
})

describe('streaming (spec §7)', () => {
  const query: TradeSuggestQuery = {
    season: SEASON,
    focus: null,
    stance: 'overpay',
    maxTeams: 3,
    mustInclude: null
  }

  it('yields its cards in final order, with progress that only moves forward', () => {
    const { build } = syntheticBuild(searchLeague(3))
    const events: DealEvent[] = []
    const search = suggestDeals(build, query)
    let step = search.next()
    while (!step.done) {
      events.push(step.value)
      step = search.next()
    }
    const cards = events.flatMap((e) => (e.type === 'card' ? [e.card] : []))
    expect(cards).toEqual(collectDeals(build, query).cards)
    const progress = events.flatMap((e) => (e.type === 'progress' ? [e.progress] : []))
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].checked).toBeGreaterThanOrEqual(progress[i - 1].checked)
      expect(progress[i].found).toBeGreaterThanOrEqual(progress[i - 1].found)
    }
    const last = progress[progress.length - 1]
    expect(last.found).toBe(cards.length)
    if (step.value === 'complete') expect(last.checked).toBe(last.total)
    expect(progress.every((p) => p.size >= 2 && p.size <= 3)).toBe(true)
  })

  it('stops at the cap with exactly the head of an exhaustive run', () => {
    const { build } = syntheticBuild(searchLeague(3))
    const all = collectDeals(build, query, { max: 1, exhaust: true })
    expect(all.end).toBe('complete')
    expect(all.cards.length).toBeGreaterThan(1)
    const capped = collectDeals(build, query, { max: 1 })
    expect(capped.end).toBe('full')
    expect(capped.cards).toEqual(all.cards.slice(0, 1))
  })
})
