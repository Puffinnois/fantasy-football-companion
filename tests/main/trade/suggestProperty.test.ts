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

const SEEDS = [1, 2, 3]
const STANCE_LIST: TradeStance[] = ['premium', 'fair', 'overpay']
/**
 * Negative values break the optimum's monotonicity: the prunes must stay exact there too.
 * `negativeSearchLeague` is a regression net; `NEGATIVE_LEAGUE` is the fixture where a missing
 * negative-value guard actually changes the answer.
 */
const CASES: [string, SyntheticLeague][] = [
  ...SEEDS.flatMap((seed): [string, SyntheticLeague][] => [
    [`positive values, seed ${seed}`, searchLeague(seed)],
    [`negative values, seed ${seed}`, negativeSearchLeague(seed)]
  ]),
  ['hand-built negative values', NEGATIVE_LEAGUE]
]

describe('suggestDeals equals the brute force (spec §7)', () => {
  it.each(CASES)(
    '%s: every team count, stance, focus and must-include',
    (_label, league) => {
      const { build } = syntheticBuild(league)
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
    },
    180_000
  )

  it('exercises deals beyond two teams and alternatives', () => {
    // Guards the fixture: if it ever stops producing these, raise SEEDS (e.g. 1–6).
    let multi = 0
    let alternatives = 0
    for (const seed of SEEDS) {
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
