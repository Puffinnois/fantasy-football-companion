import { describe, expect, it } from 'vitest'
import {
  accepts,
  BOUND_SLACK,
  bridgeLabel,
  dealProposal,
  dealsAt,
  dealTransfers,
  refuses,
  type Deal
} from '@main/trade/bridge'
import {
  mySideKey,
  searchContext,
  sideOf,
  subsets,
  type MySide,
  type SearchContext
} from '@main/trade/searchContext'
import { sideKey } from '@main/trade/side'
import type { PlayerSeries } from '@main/value/series'
import type { Team } from '@shared/types'
import {
  FORCED_PAIR_LEAGUE,
  NEGATIVE_LEAGUE,
  negativeSearchLeague,
  OVERFULL_LEAGUE,
  searchLeague,
  syntheticBuild,
  TRIANGLE_LEAGUE,
  type SyntheticLeague
} from '../../fixtures/synthetic'
import { cycleKey, oracleDeals, type EvalCache } from './suggestOracle'

function drain<T>(it: Generator<void, T>): T {
  let step = it.next()
  while (!step.done) step = it.next()
  return step.value
}

function sideOfIds(ctx: SearchContext, x: string[], z: string[], c: number): MySide {
  const find = (id: string): PlayerSeries => {
    for (const roster of ctx.build.rosters.values()) {
      const hit = roster.find((s) => s.base.playerId === id)
      if (hit) return hit
    }
    throw new Error(`no player ${id}`)
  }
  const team = ctx.others.find((t) => t.rosterId === c)
  if (!team) throw new Error(`no team ${c}`)
  const xs = x.map(find)
  const zs = z.map(find)
  return { x: xs, z: zs, c: team, key: mySideKey(xs, zs, team) }
}

const labels = (deals: Deal[]): string[] => deals.map(bridgeLabel).sort()

describe('dealsAt on the triangle league (spec §3.3)', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)

  it('finds no 2-team deal and every bridge through Three', () => {
    const ctx = searchContext(build, null)
    const side = sideOfIds(ctx, ['a2'], ['b2'], 2)
    expect(drain(dealsAt(ctx, side, 2))).toEqual([])
    const deals = drain(dealsAt(ctx, side, 3))
    expect(labels(deals)).toEqual([
      'via Three: c1',
      'via Three: c1, c3',
      'via Three: c2',
      'via Three: c2, c3'
    ])
    const viaC2 = deals.find((d) => bridgeLabel(d) === 'via Three: c2')
    expect(viaC2?.teams.map((t) => t.rosterId)).toEqual([3, 2])
    expect(viaC2?.accepted.map((a) => [a.acceptance, a.core.deltaPerWeek])).toEqual([
      ['both', 10],
      ['lineup', 10]
    ])
    expect(viaC2 && dealProposal(ctx.me, viaC2)).toEqual({
      moves: [
        { playerId: 'a2', to: 3 },
        { playerId: 'c2', to: 2 },
        { playerId: 'b2', to: 1 }
      ]
    })
    // The same deal with each move's source: hop i leaves the team before it (me first).
    expect(viaC2 && dealTransfers(ctx.me, viaC2)).toEqual([
      { playerId: 'a2', from: 1, to: 3 },
      { playerId: 'c2', from: 3, to: 2 },
      { playerId: 'b2', from: 2, to: 1 }
    ])
    const viaC1C3 = deals.find((d) => bridgeLabel(d) === 'via Three: c1, c3')
    expect(viaC1C3?.accepted[1].core.drops.map((p) => p.playerId)).toEqual(['b3'])
  })

  it('keeps the must-include team in the deal', () => {
    // a2 for c2 works straight with Three…
    const free = searchContext(build, null)
    expect(drain(dealsAt(free, sideOfIds(free, ['a2'], ['c2'], 3), 2))).toHaveLength(1)
    // …but not when Two must be part of it: k = 2 has no bridge to put Two in.
    const withTwo = searchContext(build, 2)
    expect(drain(dealsAt(withTwo, sideOfIds(withTwo, ['a2'], ['c2'], 3), 2))).toEqual([])
    // When the must-include team is C itself, nothing changes.
    expect(labels(drain(dealsAt(withTwo, sideOfIds(withTwo, ['a2'], ['b2'], 2), 3)))).toHaveLength(
      4
    )
  })

  it('yields once per first bridge team', () => {
    const ctx = searchContext(build, null)
    const it = dealsAt(ctx, sideOfIds(ctx, ['a2'], ['b2'], 2), 3)
    let ticks = 0
    for (let step = it.next(); !step.done; step = it.next()) ticks++
    expect(ticks).toBe(1) // Three is the only possible bridge team
  })
})

describe('dealsAt equals a brute force (prunes are exact)', () => {
  it.each([
    ['positive values', searchLeague, [1, 2]],
    ['negative values', negativeSearchLeague, [1, 2]],
    // Hand-built: the one league where the unguarded prunes really drop a deal.
    ['forced negatives', () => NEGATIVE_LEAGUE, [0]]
  ] as const)(
    'finds exactly the working deals of every size with %s',
    (_label, league, seeds) => {
      for (const seed of seeds) {
        const { build } = syntheticBuild(league(seed))
        const cache: EvalCache = new Map()
        for (const mustInclude of [null, 3]) {
          const ctx = searchContext(build, mustInclude)
          const mine = build.rosters.get(ctx.me.rosterId) ?? []
          const xs = subsets(mine).slice(0, mine.length + 2) // singles and the first two pairs
          for (const c of ctx.others) {
            const theirs = build.rosters.get(c.rosterId) ?? []
            const zs = subsets(theirs).slice(0, theirs.length + 1) // singles and the first pair
            for (const x of xs) {
              for (const z of zs) {
                if (x.length === 2 && z.length === 2) continue
                const side: MySide = { x, z, c, key: mySideKey(x, z, c) }
                for (const k of [2, 3, 4]) {
                  const fast = drain(dealsAt(ctx, side, k))
                    .map(cycleKey)
                    .sort()
                  const slow = oracleDeals(build, side, k, mustInclude, cache)
                  expect({ seed, mustInclude, side: side.key, k, deals: fast }).toEqual({
                    seed,
                    mustInclude,
                    side: side.key,
                    k,
                    deals: slow
                  })
                }
              }
            }
          }
        }
      }
    },
    120_000
  )
})

describe('dealsAt with the must-include team in any bridge slot (follow-ups §7)', () => {
  it('equals the brute force on 5-team deals', () => {
    const { build } = syntheticBuild(searchLeague(1, 5))
    const cache: EvalCache = new Map()
    const ctx = searchContext(build, 3)
    const c = ctx.others.find((t) => t.rosterId === 2)
    if (!c) throw new Error('no team 2')
    const mine = build.rosters.get(ctx.me.rosterId) ?? []
    const theirs = build.rosters.get(c.rosterId) ?? []
    /** Deals with team 3 in bridge slot 0, 1 (the middle) and 2. */
    const slots = [0, 0, 0]
    for (const x of mine) {
      for (const z of theirs) {
        const side: MySide = { x: [x], z: [z], c, key: mySideKey([x], [z], c) }
        const deals = drain(dealsAt(ctx, side, 5))
        for (const d of deals) slots[d.teams.findIndex((t) => t.rosterId === 3)]++
        expect({ side: side.key, deals: deals.map(cycleKey).sort() }).toEqual({
          side: side.key,
          deals: oracleDeals(build, side, 5, 3, cache)
        })
      }
    }
    // The test reaches every slot, the middle one included — it cannot pass by checking nothing.
    expect(slots.every((n) => n > 0)).toBe(true)
  }, 120_000)
})

describe('dealsAt on the negative league', () => {
  it('keeps the deal where Two sheds both forced negatives for a QB it can never start', () => {
    const { build } = syntheticBuild(NEGATIVE_LEAGUE)
    const ctx = searchContext(build, null)
    const side = sideOfIds(ctx, ['a1'], ['m1', 'm2'], 2)
    // Two: m1 for j and m2 for j are Δ 0 (refused on the market); both together are +1 a window.
    const deals = drain(dealsAt(ctx, side, 3))
    expect(labels(deals)).toContain('via Three: j')
    const viaJ = deals.find((d) => bridgeLabel(d) === 'via Three: j')
    expect(viaJ?.accepted.map((a) => [a.acceptance, a.core.delta])).toEqual([
      ['both', 21],
      ['lineup', 1]
    ])
  })
})

describe('SearchContext.slack', () => {
  it('sums the negative weekly values a lineup could be forced to take', () => {
    const plain = searchContext(syntheticBuild(searchLeague(1)).build, null)
    expect([1, 2, 3, 4].map((id) => plain.slack(id, []))).toEqual([0, 0, 0, 0])
    const { build } = syntheticBuild(negativeSearchLeague(1))
    const ctx = searchContext(build, null)
    // teams 1 and 3: two players at −2 in week 3
    expect([1, 2, 3, 4].map((id) => ctx.slack(id, []))).toEqual([4, 0, 4, 0])
    // generateLeague numbers players p1… team by team (16 each); team 3 keeps p35, p36 (RBs) and
    // p40, p41 (WRs), and p36 / p41 are the negative ones.
    const three = (id: string): PlayerSeries =>
      (build.rosters.get(3) ?? []).find((s) => s.base.playerId === id) as PlayerSeries
    expect(ctx.slack(2, [three('p36')])).toBe(2)
    expect(ctx.slack(1, [three('p35')])).toBe(4)
  })
})

const player = (ctx: SearchContext, id: string): PlayerSeries => {
  for (const roster of ctx.build.rosters.values()) {
    const hit = roster.find((s) => s.base.playerId === id)
    if (hit) return hit
  }
  throw new Error(`no player ${id}`)
}
const team = (ctx: SearchContext, id: number): Team =>
  ctx.others.find((t) => t.rosterId === id) as Team

describe('refuses (spec §3.3, exact prunes alone)', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)

  it('refuses without a solve when nothing it gets can start and the market is short', () => {
    const ctx = searchContext(build, null)
    // Two gives b2 for a2: a2 can't start behind b4, 1 000 for 3 000.
    expect(refuses(ctx, team(ctx, 2), [player(ctx, 'b2')], [player(ctx, 'a2')])).toBe(true)
    expect(ctx.memo.size).toBe(0)
    // Three takes a2 for c2 (it starts a2 over c3): no prune applies.
    expect(refuses(ctx, team(ctx, 3), [player(ctx, 'c2')], [player(ctx, 'a2')])).toBe(false)
  })

  it('solves the smaller deal a pair is compared against (B-first)', () => {
    const ctx = searchContext(build, null)
    const [c2, c3, a2] = ['c2', 'c3', 'a2'].map((id) => player(ctx, id))
    // Three would take a2 for c2 alone and for c3 alone, so the pair is not refused…
    expect(refuses(ctx, team(ctx, 3), [c2, c3], [a2])).toBe(false)
    // …and both smaller deals are now solved and shared.
    expect(ctx.memo.has(sideKey(3, [c2], [a2]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c3], [a2]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c2, c3], [a2]))).toBe(false)
  })

  it('bounds a received pair by its two singles when nothing is below zero', () => {
    const ctx = searchContext(build, null)
    const [c4, a2, b3] = ['c4', 'a2', 'b3'].map((id) => player(ctx, id))
    // Three gives c4 (its only WR) for a2 + b3. a2 starts at RB, so the "can't start" prune
    // does not apply; but a2 alone is −16, b3 alone −36, nothing at all −36: the pair is at most
    // −16 and the market (1 200 for 3 000) is short — refused without solving the pair.
    expect(refuses(ctx, team(ctx, 3), [c4], [a2, b3])).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c4], [a2]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c4], [b3]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c4], []))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c4], [a2, b3]))).toBe(false)
    // Two gives b1 for a4 + a3: a4 alone is +2, so the bound (+2) allows it — and indeed Two
    // gains with the pair (drops b3, starts a4 at TE).
    const [b1, a4, a3] = ['b1', 'a4', 'a3'].map((id) => player(ctx, id))
    expect(refuses(ctx, team(ctx, 2), [b1], [a4, a3])).toBe(false)
  })
})

describe('the received-pair bound steps aside where it is not exact', () => {
  /** The search finds exactly what the brute force finds for me giving `x` for `z` with Two. */
  const searchEqualsOracle = (league: SyntheticLeague, x: string[], z: string[]): string[] => {
    const { build } = syntheticBuild(league)
    const ctx = searchContext(build, null)
    const side = sideOfIds(ctx, x, z, 2)
    const fast = drain(dealsAt(ctx, side, 2)).map(cycleKey)
    expect(fast).toEqual(oracleDeals(build, side, 2, null, new Map()))
    return fast
  }

  it('when a received single needs a drop', () => {
    const { build } = syntheticBuild(OVERFULL_LEAGUE)
    const ctx = searchContext(build, null)
    const two = team(ctx, 2)
    const [t1, h1, h2] = ['t1', 'h1', 'h2'].map((id) => player(ctx, id))
    // Two holds five at size 4: both singles drop t4 and so understate what h1 and h2 add…
    const withH1 = sideOf(ctx, two, [t1], [h1])
    const withH2 = sideOf(ctx, two, [t1], [h2])
    const withNone = sideOf(ctx, two, [t1], [])
    expect([withH1, withH2].map((s) => [s.delta, s.drops.map((p) => p.playerId)])).toEqual([
      [1, ['t4']],
      [-2, ['t4']]
    ])
    expect(withNone.delta).toBe(0)
    // …so the bound they would give (−1) is below the pair's real +2, and it must not be applied.
    expect(withH1.delta + withH2.delta - withNone.delta + BOUND_SLACK).toBeLessThan(0)
    expect(refuses(ctx, two, [t1], [h1, h2])).toBe(false)
    const taken = accepts(ctx, two, [t1], [h1, h2])
    expect(taken?.acceptance).toBe('lineup')
    expect(taken?.core.delta).toBe(2)
    expect(searchEqualsOracle(OVERFULL_LEAGUE, ['h1', 'h2'], ['t1'])).toHaveLength(1)
  })

  it('when a negative value could be forced into a slot', () => {
    const { build } = syntheticBuild(FORCED_PAIR_LEAGUE)
    const ctx = searchContext(build, null)
    const two = team(ctx, 2)
    const [q1, n1, n2] = ['q1', 'n1', 'n2'].map((id) => player(ctx, id))
    // Alone, each of n1 and n2 is forced into FLEX (−4, then 1 and 1); together they still fill
    // only the one slot, so the pair is −2, not the −4 the singles add up to.
    expect(ctx.slack(2, [n1, n2])).toBe(8)
    const withN1 = sideOf(ctx, two, [q1], [n1])
    const withN2 = sideOf(ctx, two, [q1], [n2])
    const withNone = sideOf(ctx, two, [q1], [])
    expect([withN1.delta, withN2.delta, withNone.delta]).toEqual([-2, -2, 0])
    expect(withN1.delta + withN2.delta - withNone.delta + BOUND_SLACK).toBeLessThan(-3)
    expect(refuses(ctx, two, [q1], [n1, n2])).toBe(false)
    const taken = accepts(ctx, two, [q1], [n1, n2])
    expect(taken?.acceptance).toBe('market')
    expect(taken?.core.delta).toBe(-2)
    expect(searchEqualsOracle(FORCED_PAIR_LEAGUE, ['n1', 'n2'], ['q1'])).toHaveLength(1)
  })
})
