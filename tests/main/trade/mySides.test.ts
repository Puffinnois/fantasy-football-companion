import { describe, expect, it } from 'vitest'
import type { LineupBuild } from '@main/lineup/build'
import { refuses } from '@main/trade/bridge'
import { marketRatio, marketSum } from '@main/trade/evaluate'
import { mySideQueue, rankOrder, type RankedSide } from '@main/trade/mySides'
import { searchContext } from '@main/trade/searchContext'
import { sideKey } from '@main/trade/side'
import { STANCES } from '@main/trade/thresholds'
import type { TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  generateLeague,
  NEGATIVE_LEAGUE,
  negativeSearchLeague,
  searchLeague,
  SMALL_LEAGUE,
  syntheticBuild,
  TRIANGLE_LEAGUE
} from '../../fixtures/synthetic'

const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null,
  ...over
})

/** The lazy queue hands out exactly what scoring every candidate and sorting would. */
function expectExactRankOrder(build: LineupBuild, tag: Record<string, unknown>): void {
  for (const stance of ['premium', 'fair', 'overpay'] as const) {
    for (const [maxTeams, mustInclude] of [
      [2, null],
      [2, 3],
      [3, null],
      [3, 3]
    ] as const) {
      const q = query({ stance, maxTeams, mustInclude })
      const lazy = mySideQueue(searchContext(build, mustInclude), q, maxTeams)
      const popped: RankedSide[] = []
      for (let s = lazy.next(); s !== null; s = lazy.next()) popped.push(s)
      // Brute force: score every candidate, keep the passing ones, sort on the rank key.
      const eager = mySideQueue(searchContext(build, mustInclude), q, maxTeams)
      const all = eager.sides
        .map((s) => eager.exact(s.x, s.z, s.c))
        .filter((s): s is RankedSide => s !== null)
        .sort(rankOrder)
      const label = { ...tag, stance, maxTeams, mustInclude }
      expect({ ...label, keys: popped.map((s) => s.key) }).toEqual({
        ...label,
        keys: all.map((s) => s.key)
      })
      expect(lazy.total).toBe(lazy.sides.length)
      expect(lazy.discarded + popped.length).toBe(lazy.total)
    }
  }
}

describe('mySideQueue (spec §3.2)', () => {
  it('hands out every passing my side in exact rank order', () => {
    for (const league of [searchLeague, negativeSearchLeague]) {
      for (const seed of [1, 2, 3]) {
        expectExactRankOrder(syntheticBuild(league(seed)).build, { league: league.name, seed })
      }
    }
  }, 60_000)

  it('keeps a pair that only wins by giving away both forced negatives', () => {
    const { build } = syntheticBuild(NEGATIVE_LEAGUE)
    expectExactRankOrder(build, { league: 'NEGATIVE_LEAGUE' })
    // n1 + n2 for z is the premium deal (Δ 4, 1.33 a week); z alone adds 2 (0.67 a week) and
    // n1 for z or n2 for z are 2 as well — so neither U(z) nor the single may rule it out.
    const q = mySideQueue(searchContext(build, null), query({ stance: 'premium' }), 3)
    const keys: string[] = []
    for (let s = q.next(); s !== null; s = q.next()) keys.push(s.key)
    expect(keys).toContain('n1+n2|z|4')
  })

  it('applies the focus, the wanted position, must-include and the market precheck', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const ids = (list: { base: { playerId: string } }[]): string[] =>
      list.map((s) => s.base.playerId)
    const give = mySideQueue(searchContext(build, null), query({ focus: { give: 'C' } }), 3)
    expect(give.sides.length).toBeGreaterThan(0)
    expect(give.sides.every((s) => ids(s.x).includes('C'))).toBe(true)
    const want = mySideQueue(searchContext(build, null), query({ focus: { want: 'WR' } }), 3)
    expect(want.sides.every((s) => s.z.some((p) => p.base.position === 'WR'))).toBe(true)
    // Must-include restricts C only when the deal cannot have a bridge.
    const two = mySideQueue(searchContext(build, 3), query({ mustInclude: 3 }), 2)
    expect(new Set(two.sides.map((s) => s.c.rosterId))).toEqual(new Set([3]))
    const three = mySideQueue(searchContext(build, 3), query({ mustInclude: 3 }), 3)
    expect(new Set(three.sides.map((s) => s.c.rosterId))).toEqual(new Set([2, 3]))
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const q = mySideQueue(searchContext(build, null), query({ stance }), 3)
      for (const s of q.sides) {
        const ratio = marketRatio({
          marketGive: marketSum(build, s.x).total,
          marketGet: marketSum(build, s.z).total
        })
        expect(ratio).toBeGreaterThanOrEqual(STANCES[stance].ratio)
        expect(s.x.length + s.z.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('solves lazily: the first my side costs far fewer solves than there are candidates', () => {
    const { build } = syntheticBuild(generateLeague(7))
    const ctx = searchContext(build, null)
    const q = mySideQueue(ctx, query(), 3)
    expect(q.next()).not.toBeNull()
    expect(ctx.memo.size).toBeLessThan(q.total / 10)
  }, 60_000)

  it('asks C first at two teams: a refused side is never scored', () => {
    const { build } = syntheticBuild(TRIANGLE_LEAGUE)
    const q = query({ maxTeams: 2 })
    const scoredKey = (ctx: ReturnType<typeof searchContext>): string => {
      const roster = build.rosters.get(1) ?? []
      const a2 = roster.filter((s) => s.base.playerId === 'a2')
      const b2 = (build.rosters.get(2) ?? []).filter((s) => s.base.playerId === 'b2')
      return sideKey(ctx.me.rosterId, a2, b2)
    }
    const plain = searchContext(build, null)
    const without = mySideQueue(plain, q, 2)
    while (without.next() !== null);
    expect(plain.memo.has(scoredKey(plain))).toBe(true) // a2 → b2 passes my stance: scored
    const early = searchContext(build, null)
    const withRefuse = mySideQueue(early, q, 2, (side) => refuses(early, side.c, side.z, side.x))
    const popped: string[] = []
    for (let s = withRefuse.next(); s !== null; s = withRefuse.next()) popped.push(s.key)
    expect(early.memo.has(scoredKey(early))).toBe(false) // Two refuses a2 for b2: never scored
    expect(popped).not.toContain('a2|b2|2')
    expect(withRefuse.discarded + popped.length).toBe(withRefuse.total)
  })
})
