import { describe, expect, it } from 'vitest'
import { suggestDeals } from '@main/trade/suggest'
import type { TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/**
 * Spec §7: the time to the first card is what the streamed list makes the user wait. A regression
 * ceiling, not the UX target (that is the real-league gate): 1.5 × the slowest synthetic up-to-3
 * first card (5.0 s), measured on 2026-10-03.
 */
const FIRST_CARD_MS = 8000
/** 6b's two-team budgets, carried over: one partner stays interactive, every team is a ceiling. */
const FOCUSED_MS = 3000
const ALL_TEAMS_MS = 20000

interface Timing {
  first: number | null
  total: number
  cards: number
  end: string
}

/**
 * Timing-sensitive: `npm test` runs its files in parallel workers, which is enough contention to
 * make a wall-clock assertion flap, so this runs only under `npm run test:budget`. Run it locally
 * before every build.
 */
describe.skipIf(!process.env.FFC_BUDGET)('suggestDeals budget', () => {
  const { build } = syntheticBuild(generateLeague(7))
  const query = (over: Partial<TradeSuggestQuery>): TradeSuggestQuery => ({
    season: SEASON,
    focus: null,
    stance: 'fair',
    maxTeams: 2,
    mustInclude: null,
    ...over
  })
  /** Drives the search the way the worker does, noting when the first card arrives. */
  const time = (q: TradeSuggestQuery): Timing => {
    const t0 = performance.now()
    let first: number | null = null
    let cards = 0
    const search = suggestDeals(build, q)
    let step = search.next()
    while (!step.done) {
      if (step.value.type === 'card') {
        cards++
        if (first === null) first = performance.now() - t0
      }
      step = search.next()
    }
    return { first, total: performance.now() - t0, cards, end: step.value }
  }
  const show = (label: string, t: Timing): void => {
    const first = t.first === null ? '—' : `${t.first.toFixed(0)} ms`
    console.info(
      `${label}: first card ${first} · ${t.cards} cards (${t.end}) in ${t.total.toFixed(0)} ms`
    )
  }

  it('keeps the two-team searches within 6b’s budgets', () => {
    const partner = time(query({ mustInclude: 3 }))
    show('2 teams, with team 3', partner)
    expect(partner.total).toBeLessThan(FOCUSED_MS)
    const focus = time(query({ focus: { give: build.rosters.get(1)?.[2].base.playerId ?? '' } }))
    show('2 teams, focus give', focus)
    expect(focus.total).toBeLessThan(FOCUSED_MS)
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const all = time(query({ stance }))
      show(`2 teams, any team, ${stance}`, all)
      expect(all.total).toBeLessThan(ALL_TEAMS_MS)
    }
  }, 180_000)

  it('shows the first card of an up-to-3-team search fast; the full list is measured only', () => {
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const t = time(query({ maxTeams: 3, stance }))
      show(`up to 3 teams, any team, ${stance}`, t)
      if (t.cards > 0) expect(t.first ?? Number.POSITIVE_INFINITY).toBeLessThan(FIRST_CARD_MS)
    }
  }, 1_800_000)
})
