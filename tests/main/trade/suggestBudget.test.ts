import { describe, expect, it } from 'vitest'
import { suggestTrades } from '@main/trade/suggest'
import { SEASON } from '../../fixtures/season'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Spec §6: what the screen's default searches must cost on a 16-team league. */
const FOCUSED_MS = 3000
/**
 * The unfocused league-wide scan is the slow path: it enumerates every partner and is the reason
 * `trade:suggest` runs in a worker thread, so this is a regression ceiling, not a UX budget.
 */
const ALL_TEAMS_MS = 20000

/**
 * Timing-sensitive, so skipped in CI; run locally before every build
 * (`npx vitest run suggestBudget`).
 */
describe.skipIf(!!process.env.CI)('suggestTrades budget', () => {
  const { build } = syntheticBuild(generateLeague(7))
  const query = (over: object): Parameters<typeof suggestTrades>[1] => ({
    season: SEASON,
    focus: null,
    stance: 'fair',
    partnerRosterId: null,
    ...over
  })
  const time = (q: Parameters<typeof suggestTrades>[1]): number => {
    const t0 = performance.now()
    const out = suggestTrades(build, q)
    const ms = performance.now() - t0
    expect(out.length).toBeLessThanOrEqual(30)
    return ms
  }

  it('answers the screen defaults — one partner, one focus player — well inside the budget', () => {
    const partner = time(query({ partnerRosterId: 3 }))
    const focus = time(query({ focus: { give: build.rosters.get(1)?.[2].base.playerId ?? '' } }))
    console.info(`one partner ${partner.toFixed(0)} ms · focus give ${focus.toFixed(0)} ms`)
    expect(partner).toBeLessThan(FOCUSED_MS)
    expect(focus).toBeLessThan(FOCUSED_MS)
  })

  it('keeps the league-wide scan within its regression ceiling at every stance', () => {
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const ms = time(query({ stance }))
      console.info(`all teams, ${stance}: ${ms.toFixed(0)} ms`)
      expect(ms).toBeLessThan(ALL_TEAMS_MS)
    }
  })
})
