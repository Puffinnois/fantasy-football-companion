import { round2 } from '@main/db/repos/points'
import { teamName } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeSuggestQuery } from '@shared/types'
import { marketRatio, marketSum } from './evaluate'
import { heap } from './heap'
import {
  byText,
  desc,
  idsKey,
  mySideKey,
  sideOf,
  subsets,
  type MySide,
  type SearchContext
} from './searchContext'
import { sideFor, sideKey, type SideCore } from './side'
import { passesStance, STANCES, stanceDelta } from './thresholds'

/** A my side scored exactly: it passes the stance. */
export interface RankedSide extends MySide {
  core: SideCore
  ratio: number
}

export interface MySideQueue {
  /** Spec §3.2: every candidate left after the market precheck, in enumeration order. */
  readonly sides: MySide[]
  /** The progress total: `sides.length`. */
  readonly total: number
  /** Candidates resolved inside the queue: discarded on their bound or failing the stance. */
  readonly discarded: number
  /** The next my side in rank order that passes the stance; null when none is left. */
  next(): RankedSide | null
  /** The candidate with these ends, scored — null when it is no candidate or fails the stance. */
  exact(x: PlayerSeries[], z: PlayerSeries[], c: Team): RankedSide | null
}

/** Spec §3.2's rank key: my Δ desc, my market ratio desc, C's name asc, x's then z's ids asc. */
export function rankOrder(a: RankedSide, b: RankedSide): number {
  return (
    desc(a.core.delta, b.core.delta) ||
    desc(a.ratio, b.ratio) ||
    teamName(a.c).localeCompare(teamName(b.c)) ||
    byText(idsKey(a.x), idsKey(b.x)) ||
    byText(idsKey(a.z), idsKey(b.z))
  )
}

type Entry =
  | { kind: 'bound'; delta: number; seq: number; side: MySide }
  | { kind: 'exact'; delta: number; seq: number; side: RankedSide }

function before(a: Entry, b: Entry): boolean {
  if (a.delta !== b.delta) return a.delta > b.delta
  // Spec §3.2: at equal Δ an unevaluated side goes first — it might tie or beat the exact one.
  if (a.kind !== b.kind) return a.kind === 'bound'
  if (a.kind === 'exact' && b.kind === 'exact') return rankOrder(a.side, b.side) < 0
  return a.seq < b.seq
}

/**
 * Spec §3.2: my sides, lazily best-first. Each candidate enters the queue at its bound U(z) — my
 * window total on my roster plus z, nothing given, no drop rule, minus my total now. My
 * after-roster is a subset of that roster and the optimum is monotone in the roster, so U(z)
 * bounds my Δ for every x. A popped bound entry is replaced by its exact result; an exact entry
 * is popped only when nothing unevaluated can tie or beat it.
 */
export function mySideQueue(
  ctx: SearchContext,
  query: TradeSuggestQuery,
  kMax: number
): MySideQueue {
  const { build, me, weeks } = ctx
  const { stance } = query
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  const xs = subsets(build.rosters.get(me.rosterId) ?? []).filter(
    (x) => focusGive === null || x.some((s) => s.base.playerId === focusGive)
  )
  const sides: MySide[] = []
  const byKey = new Map<string, MySide>()
  const queue = heap<Entry>(before)
  let seq = 0
  let discarded = 0
  for (const c of ctx.others) {
    // Without a bridge, the must-include team can only be C.
    if (kMax === 2 && query.mustInclude !== null && c.rosterId !== query.mustInclude) continue
    const pool = (build.rosters.get(c.rosterId) ?? []).filter((s) => ctx.enters(me.rosterId, s))
    for (const z of subsets(pool)) {
      if (want !== null && !z.some((s) => s.base.position === want)) continue
      const getValue = marketSum(build, z).total
      const group: MySide[] = []
      for (const x of xs) {
        if (x.length === 2 && z.length === 2) continue
        // Market precheck: my ratio needs no solve.
        const ratio = marketRatio({ marketGive: marketSum(build, x).total, marketGet: getValue })
        if (ratio < STANCES[stance].ratio) continue
        const side: MySide = { x, z, c, key: mySideKey(x, z, c) }
        group.push(side)
        sides.push(side)
        byKey.set(side.key, side)
      }
      if (group.length === 0) continue
      const bound = sideFor(
        build,
        { team: me, give: [], get: z },
        weeks,
        null,
        ctx.startsOf,
        {}
      ).delta
      if (!stanceDelta(stance, round2(bound / weeks.length) ?? 0)) {
        discarded += group.length
        continue
      }
      // Singles before pairs at equal bound: the Plan M check below finds them solved.
      for (const side of group) queue.push({ kind: 'bound', delta: bound, seq: seq++, side })
    }
  }

  const score = (side: MySide): RankedSide | null => {
    const core = sideOf(ctx, me, side.x, side.z)
    const ratio = marketRatio(core)
    return passesStance(stance, core.deltaPerWeek, ratio) ? { ...side, core, ratio } : null
  }
  /** Plan M: giving a second player cannot beat a contained single (same z) that needed no drops. */
  const boundedOut = (side: MySide): boolean =>
    side.x.length === 2 &&
    side.x.some((s) => {
      const smaller = ctx.memo.get(sideKey(me.rosterId, [s], side.z))
      return (
        smaller !== undefined &&
        smaller.drops.length === 0 &&
        !stanceDelta(stance, smaller.deltaPerWeek)
      )
    })

  return {
    sides,
    total: sides.length,
    get discarded(): number {
      return discarded
    },
    next(): RankedSide | null {
      for (let e = queue.pop(); e !== undefined; e = queue.pop()) {
        if (e.kind === 'exact') return e.side
        if (boundedOut(e.side)) {
          discarded++
          continue
        }
        const ranked = score(e.side)
        if (ranked === null) {
          discarded++
          continue
        }
        queue.push({ kind: 'exact', delta: ranked.core.delta, seq: e.seq, side: ranked })
      }
      return null
    },
    exact(x: PlayerSeries[], z: PlayerSeries[], c: Team): RankedSide | null {
      const side = byKey.get(mySideKey(x, z, c))
      return side ? score(side) : null
    }
  }
}
