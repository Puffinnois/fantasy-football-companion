import { describe, expect, it } from 'vitest'
import { bridgeLabel, dealProposal, dealsAt, type Deal } from '@main/trade/bridge'
import {
  mySideKey,
  searchContext,
  subsets,
  type MySide,
  type SearchContext
} from '@main/trade/searchContext'
import type { PlayerSeries } from '@main/value/series'
import { searchLeague, syntheticBuild, TRIANGLE_LEAGUE } from '../../fixtures/synthetic'
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
  it('finds exactly the working deals of every size on random leagues', () => {
    for (const seed of [1, 2]) {
      const { build } = syntheticBuild(searchLeague(seed))
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
  }, 120_000)
})
