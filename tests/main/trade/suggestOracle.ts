import { teamName, teamWeek, windowWeeks, type LineupBuild } from '@main/lineup/build'
import { entersLineup } from '@main/trade/enter'
import { evaluateTrade, marketRatio } from '@main/trade/evaluate'
import { acceptanceOf, DOMINANCE_PTS, passesStance, SUGGEST_MAX } from '@main/trade/thresholds'
import type { PlayerSeries } from '@main/value/series'
import type {
  Team,
  TradeEvaluation,
  TradeProposal,
  TradeSideResult,
  TradeSuggestion,
  TradeSuggestQuery
} from '@shared/types'

/**
 * Multi-team spec §7 — the reference the search must equal. Enumerates every cycle me → T1 → … →
 * C → me of 2..maxTeams teams in the §3.1 shapes and evaluates each deal whole with
 * `evaluateTrade(…, { skip: false })`: no side memo, no week skip, no prunes, no bound, no early
 * stop. Then §3.3–§3.4 as written: the smallest working size per my side, the representative and
 * its alternatives, dominance, the rank order, the cap. `cache` keeps whole-deal evaluations across
 * calls on one build — an evaluation depends on nothing but the build and the proposal.
 */

type Hop = PlayerSeries[]
export type EvalCache = Map<string, TradeEvaluation>

/** T1 … C, and hops[0] = what I give … hops[k − 1] = what I get. */
export interface Cycle {
  teams: Team[]
  hops: Hop[]
}
interface Working extends Cycle {
  evaluation: TradeEvaluation
}
interface Smallest {
  k: number
  deals: Working[]
}

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const desc = (a: number, b: number): number => (a === b ? 0 : a > b ? -1 : 1)
const ids = (hop: Hop): string =>
  hop
    .map((s) => s.base.playerId)
    .sort()
    .join('+')
const playerIds = (list: { playerId: string }[]): string =>
  list
    .map((p) => p.playerId)
    .sort()
    .join('+')

/** Every 1- and 2-element subset: singles in list order, then pairs. */
function subsets<T>(list: T[]): T[][] {
  const out: T[][] = list.map((x) => [x])
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

/** Ordered selections of n distinct items. */
function arrangements<T>(list: T[], n: number): T[][] {
  if (n === 0) return [[]]
  return list.flatMap((first, i) =>
    arrangements([...list.slice(0, i), ...list.slice(i + 1)], n - 1).map((rest) => [first, ...rest])
  )
}

/** One hop per bridge team; at most one of two players, none when x or z is already a pair. */
function hopChoices(build: LineupBuild, teams: Team[], pairFree: boolean): Hop[][] {
  let partial: { hops: Hop[]; pairUsed: boolean }[] = [{ hops: [], pairUsed: !pairFree }]
  for (const t of teams) {
    const options = subsets(build.rosters.get(t.rosterId) ?? [])
    partial = partial.flatMap((p) =>
      options
        .filter((hop) => hop.length === 1 || !p.pairUsed)
        .map((hop) => ({ hops: [...p.hops, hop], pairUsed: p.pairUsed || hop.length === 2 }))
    )
  }
  return partial.map((p) => p.hops)
}

export function cycleProposal(me: number, cycle: Cycle): TradeProposal {
  const last = cycle.hops.length - 1
  return {
    moves: cycle.hops.flatMap((hop, i) =>
      hop.map((s) => ({ playerId: s.base.playerId, to: i === last ? me : cycle.teams[i].rosterId }))
    )
  }
}

export function cycleKey(cycle: Cycle): string {
  return `${cycle.teams.map((t) => t.rosterId).join('>')}|${cycle.hops.map(ids).join('>')}`
}

function meOf(build: LineupBuild): Team {
  const me = build.inputs.teams.find((t) => t.isMe)
  if (!me) throw new Error('oracle: the league has no "me"')
  return me
}

function evaluator(build: LineupBuild, cache: EvalCache): (cycle: Cycle) => TradeEvaluation {
  const me = meOf(build).rosterId
  return (cycle) => {
    const proposal = cycleProposal(me, cycle)
    const key = JSON.stringify(proposal)
    const hit = cache.get(key)
    if (hit) return hit
    const evaluation = evaluateTrade(build, proposal, { skip: false })
    cache.set(key, evaluation)
    return evaluation
  }
}

/** Every cycle of exactly k teams around one my side, working or not. */
function cycles(build: LineupBuild, x: Hop, z: Hop, c: Team, k: number): Cycle[] {
  const bridge = build.inputs.teams.filter((t) => !t.isMe && t.rosterId !== c.rosterId)
  const pairFree = x.length === 1 && z.length === 1
  return arrangements(bridge, k - 2).flatMap((order) =>
    hopChoices(build, order, pairFree).map((middle) => ({
      teams: [...order, c],
      hops: [x, ...middle, z]
    }))
  )
}

/** Spec §3.3: every other team accepts (6b's rule), and the must-include team is in the deal. */
function works(evaluation: TradeEvaluation, cycle: Cycle, mustInclude: number | null): boolean {
  return (
    (mustInclude === null || cycle.teams.some((t) => t.rosterId === mustInclude)) &&
    evaluation.sides
      .slice(1)
      .every((s) => acceptanceOf(s.delta, marketRatio(s), s.deltaPerWeek) !== null)
  )
}

/** Brute force of spec §3.3 for one my side: the keys of every working deal of exactly k teams. */
export function oracleDeals(
  build: LineupBuild,
  side: { x: Hop; z: Hop; c: Team },
  k: number,
  mustInclude: number | null,
  cache: EvalCache = new Map()
): string[] {
  const evaluate = evaluator(build, cache)
  return cycles(build, side.x, side.z, side.c, k)
    .filter((cycle) => works(evaluate(cycle), cycle, mustInclude))
    .map(cycleKey)
    .sort()
}

export function oracleSuggest(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: { max?: number; cache?: EvalCache } = {}
): TradeSuggestion[] {
  const me = meOf(build)
  const others = build.inputs.teams.filter((t) => !t.isMe)
  const kMax = Math.min(Math.max(query.maxTeams, 2), others.length + 1)
  const evaluate = evaluator(build, opts.cache ?? new Map())
  const weeks = windowWeeks(build)
  const myRoster = build.rosters.get(me.rosterId) ?? []
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return []
  const myWeeks = weeks.map((w) => teamWeek(build, me.rosterId, w))

  /** A my side that passes the stance (spec §3.2). */
  interface Candidate {
    x: Hop
    z: Hop
    c: Team
    key: string
    mine: TradeSideResult
  }
  const keyOf = (x: Hop, z: Hop, c: Team): string => `${ids(x)}|${ids(z)}|${c.rosterId}`
  const passing = new Map<string, Candidate>()
  for (const c of others) {
    if (kMax === 2 && query.mustInclude !== null && c.rosterId !== query.mustInclude) continue
    const pool = (build.rosters.get(c.rosterId) ?? []).filter((s) =>
      entersLineup(build, s, weeks, myWeeks)
    )
    for (const z of subsets(pool)) {
      if (want !== null && !z.some((s) => s.base.position === want)) continue
      for (const x of subsets(myRoster)) {
        if (focusGive !== null && !x.some((s) => s.base.playerId === focusGive)) continue
        if (x.length === 2 && z.length === 2) continue
        // My side depends only on what I give and get: read it off the 2-team deal.
        const mine = evaluate({ teams: [c], hops: [x, z] }).sides[0]
        if (!passesStance(query.stance, mine.deltaPerWeek, marketRatio(mine))) continue
        const key = keyOf(x, z, c)
        passing.set(key, { x, z, c, key, mine })
      }
    }
  }

  const smallest = new Map<string, Smallest | null>()
  const smallestOf = (cand: Candidate): Smallest | null => {
    const known = smallest.get(cand.key)
    if (known !== undefined) return known
    let found: Smallest | null = null
    for (let k = 2; k <= kMax && found === null; k++) {
      const deals = cycles(build, cand.x, cand.z, cand.c, k).flatMap((cycle): Working[] => {
        const evaluation = evaluate(cycle)
        return works(evaluation, cycle, query.mustInclude) ? [{ ...cycle, evaluation }] : []
      })
      if (deals.length > 0) found = { k, deals }
    }
    smallest.set(cand.key, found)
    return found
  }

  /** Spec §3.4: a contained single my side that works with no more teams and is nearly as good. */
  const dominated = (cand: Candidate, k: number): boolean => {
    const contained = [
      ...(cand.x.length === 2 ? cand.x.map((s) => keyOf([s], cand.z, cand.c)) : []),
      ...(cand.z.length === 2 ? cand.z.map((s) => keyOf(cand.x, [s], cand.c)) : [])
    ]
    return contained.some((key) => {
      const single = passing.get(key)
      if (!single) return false
      const hit = smallestOf(single)
      return hit !== null && hit.k <= k && cand.mine.delta - single.mine.delta <= DOMINANCE_PTS
    })
  }

  const worst = (d: Working): number =>
    Math.min(...d.evaluation.sides.slice(1).map((s) => s.deltaPerWeek))
  const moved = (d: Working): number => d.hops.reduce((n, hop) => n + hop.length, 0)
  const dealOrder = (a: Working, b: Working): number => {
    const byWorst = desc(worst(a), worst(b))
    if (byWorst !== 0) return byWorst
    const byMoved = moved(a) - moved(b)
    if (byMoved !== 0) return byMoved
    for (let i = 0; i < a.teams.length; i++) {
      const byName = teamName(a.teams[i]).localeCompare(teamName(b.teams[i]))
      if (byName !== 0) return byName
    }
    return text(a.hops.map(ids).join('>'), b.hops.map(ids).join('>'))
  }
  const label = (d: Working): string =>
    `via ${d.teams
      .slice(0, -1)
      .map(
        (t, i) =>
          `${teamName(t)}: ${d.hops[i + 1]
            .map((s) => s.base.fullName)
            .sort((p, q) => p.localeCompare(q))
            .join(', ')}`
      )
      .join(' · ')}`

  const cards: TradeSuggestion[] = []
  for (const cand of passing.values()) {
    const hit = smallestOf(cand)
    if (hit === null || dominated(cand, hit.k)) continue
    const [best, ...rest] = [...hit.deals].sort(dealOrder)
    cards.push({
      evaluation: best.evaluation,
      teams: hit.k,
      acceptance: best.evaluation.sides.map((s) =>
        s.isMe ? null : acceptanceOf(s.delta, marketRatio(s), s.deltaPerWeek)
      ),
      alternatives: rest.map((d) => ({
        proposal: cycleProposal(me.rosterId, d),
        label: label(d),
        worstDeltaPerWeek: worst(d)
      }))
    })
  }
  const mine = (s: TradeSuggestion): TradeSideResult => s.evaluation.sides[0]
  const from = (s: TradeSuggestion): string =>
    s.evaluation.sides[s.evaluation.sides.length - 1].name
  cards.sort(
    (a, b) =>
      desc(mine(a).delta, mine(b).delta) ||
      desc(marketRatio(mine(a)), marketRatio(mine(b))) ||
      from(a).localeCompare(from(b)) ||
      text(playerIds(mine(a).give), playerIds(mine(b).give)) ||
      text(playerIds(mine(a).get), playerIds(mine(b).get))
  )
  return cards.slice(0, opts.max ?? SUGGEST_MAX)
}
