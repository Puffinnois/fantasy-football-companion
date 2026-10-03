import { teamName, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { TradeAlternative, TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { bridgeLabel, dealProposal, dealsAt, type Deal } from './bridge'
import { evaluateTrade, TradeError } from './evaluate'
import { mySideQueue, type RankedSide } from './mySides'
import {
  byText,
  desc,
  idsKey,
  searchContext,
  type MySide,
  type SearchContext
} from './searchContext'
import { DOMINANCE_PTS, SUGGEST_MAX } from './thresholds'

export {
  ACCEPT_LOSS_PER_WEEK,
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  stanceDelta,
  SUGGEST_MAX
} from './thresholds'

/** Spec §4.1 without the clock — the worker stamps `elapsedMs`. */
export interface SearchProgress {
  /** My sides resolved: discarded on their bound, failed the stance, or searched. */
  checked: number
  /** My-side candidates after the market precheck. */
  total: number
  /** Cards so far. */
  found: number
  /** The deal size being tried for the current my side. */
  size: number
}

export type DealEvent =
  { type: 'card'; card: TradeSuggestion } | { type: 'progress'; progress: SearchProgress }

/** `full`: the cap was reached, nothing left could rank higher; `complete`: every my side resolved. */
export type SearchEnd = 'complete' | 'full'

export interface SuggestOptions {
  /** Result cap (default `SUGGEST_MAX`). */
  max?: number
  /** Tests only: keep going past `max` until every my side is resolved. */
  exhaust?: boolean
}

/** The smallest size with a working deal for one my side, and every working deal of that size. */
interface Found {
  k: number
  deals: Deal[]
}

const worstOf = (d: Deal): number => Math.min(...d.accepted.map((a) => a.core.deltaPerWeek))
const movedOf = (d: Deal): number => d.hops.reduce((n, hop) => n + hop.length, 0)

/** Spec §3.4: the least happy other team's Δ/week desc, fewer players moved, names in cycle order, ids. */
function dealOrder(a: Deal, b: Deal): number {
  const byWorst = desc(worstOf(a), worstOf(b))
  if (byWorst !== 0) return byWorst
  const byMoved = movedOf(a) - movedOf(b)
  if (byMoved !== 0) return byMoved
  for (let i = 0; i < a.teams.length; i++) {
    const byName = teamName(a.teams[i]).localeCompare(teamName(b.teams[i]))
    if (byName !== 0) return byName
  }
  return byText(a.hops.map(idsKey).join('>'), b.hops.map(idsKey).join('>'))
}

/** Spec §3.4–3.5: one card per my side — the representative evaluated whole, the rest as alternatives. */
function cardOf(ctx: SearchContext, found: Found): TradeSuggestion {
  const [best, ...rest] = [...found.deals].sort(dealOrder)
  return {
    evaluation: evaluateTrade(ctx.build, dealProposal(ctx.me, best), { memo: ctx.memo }),
    teams: found.k,
    acceptance: [null, ...best.accepted.map((a) => a.acceptance)],
    alternatives: rest.map((d): TradeAlternative => ({
      proposal: dealProposal(ctx.me, d),
      label: bridgeLabel(d),
      worstDeltaPerWeek: worstOf(d)
    }))
  }
}

/**
 * Multi-team spec §3: deals of 2..maxTeams teams, one card per my side, yielded in final rank
 * order — so the list only appends and the run can stop at the cap. Progress events interleave.
 */
export function* suggestDeals(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): Generator<DealEvent, SearchEnd> {
  const ctx = searchContext(build, query.mustInclude)
  if (query.mustInclude !== null && !ctx.others.some((t) => t.rosterId === query.mustInclude)) {
    throw new TradeError('INVALID_TRADE', 'Must include another team in this league')
  }
  const kMax = Math.min(Math.max(Math.trunc(query.maxTeams), 2), ctx.others.length + 1)
  const max = opts.max ?? SUGGEST_MAX
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const myRoster = build.rosters.get(ctx.me.rosterId) ?? []
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return 'complete'

  const queue = mySideQueue(ctx, query, kMax)
  let found = 0
  let resolved = 0
  let size = 2
  const progress = (): DealEvent => ({
    type: 'progress',
    progress: { checked: queue.discarded + resolved, total: queue.total, found, size }
  })

  /** Per my side: how far its sizes were tried and what was found — dominance reuses it. */
  const searched = new Map<string, { upTo: number; hit: Found | null }>()
  function* search(side: MySide, upTo: number): Generator<DealEvent, Found | null> {
    let state = searched.get(side.key)
    if (!state) {
      state = { upTo: 1, hit: null }
      searched.set(side.key, state)
    }
    while (state.hit === null && state.upTo < upTo) {
      const k = state.upTo + 1
      size = k
      yield progress()
      const deals = dealsAt(ctx, side, k)
      let step = deals.next()
      while (!step.done) {
        yield progress()
        step = deals.next()
      }
      state.upTo = k
      if (step.value.length > 0) state.hit = { k, deals: step.value }
    }
    return state.hit !== null && state.hit.k <= upTo ? state.hit : null
  }

  /**
   * Spec §3.4: a pair is padding when a contained single my side passes the stance, works with no
   * more teams and is nearly as good. Resolved now — before the card is emitted — so a card is
   * never withdrawn; the single's search is remembered for when it comes up itself.
   */
  function* dominated(side: RankedSide, k: number): Generator<DealEvent, boolean> {
    const contained: [PlayerSeries[], PlayerSeries[]][] = [
      ...(side.x.length === 2
        ? side.x.map((s): [PlayerSeries[], PlayerSeries[]] => [[s], side.z])
        : []),
      ...(side.z.length === 2
        ? side.z.map((s): [PlayerSeries[], PlayerSeries[]] => [side.x, [s]])
        : [])
    ]
    for (const [x, z] of contained) {
      const single = queue.exact(x, z, side.c)
      if (single === null || side.core.delta - single.core.delta > DOMINANCE_PTS) continue
      if ((yield* search(single, k)) !== null) return true
    }
    return false
  }

  yield progress()
  for (let side = queue.next(); side !== null; side = queue.next()) {
    const hit = yield* search(side, kMax)
    if (hit !== null && !(yield* dominated(side, hit.k))) {
      found++
      yield { type: 'card', card: cardOf(ctx, hit) }
    }
    resolved++
    yield progress()
    if (found >= max && !opts.exhaust) return 'full'
  }
  return 'complete'
}

/** `suggestDeals` run to the end synchronously — tests and the budget check. */
export function collectDeals(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): { cards: TradeSuggestion[]; end: SearchEnd } {
  const cards: TradeSuggestion[] = []
  const search = suggestDeals(build, query, opts)
  let step = search.next()
  while (!step.done) {
    if (step.value.type === 'card') cards.push(step.value.card)
    step = search.next()
  }
  return { cards, end: step.value }
}
