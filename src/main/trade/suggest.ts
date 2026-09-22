import { candidateFor, teamWeek, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type {
  Team,
  TradeEvaluation,
  TradeStance,
  TradeSuggestQuery,
  TradeSuggestion
} from '@shared/types'
import { canEnter } from './enter'
import {
  evaluateTrade,
  MARKET_FAIR,
  marketRatio,
  marketSum,
  myTeam,
  requireWindow
} from './evaluate'

/** Spec 6b §3.3: what my side must clear per stance; `strict` makes the Δ/week bound exclusive. */
export const STANCES: Record<
  TradeStance,
  { deltaPerWeek: number; strict: boolean; ratio: number }
> = {
  premium: { deltaPerWeek: 1, strict: false, ratio: 1 },
  fair: { deltaPerWeek: 0, strict: true, ratio: 0.85 },
  overpay: { deltaPerWeek: -1, strict: false, ratio: 0.7 }
}
/**
 * How much weekly lineup value the other manager will swallow for a fair-value trade. Without it,
 * every market-fair consolidation qualifies however much it guts their starting lineup — on a real
 * 16-team league that was the whole top 30. Mirrors the overpay stance's bound on my own side.
 */
export const ACCEPT_LOSS_PER_WEEK = 1
/** Spec §3.4: a 2-for-1 / 1-for-2 that beats its 1-for-1 by no more than this was padding. */
export const DOMINANCE_PTS = 0.5
export const SUGGEST_MAX = 30

/** The Δ/week half of a stance's test — the bound the bigger shapes are checked against. */
export function stanceDelta(stance: TradeStance, deltaPerWeek: number): boolean {
  const s = STANCES[stance]
  return s.strict ? deltaPerWeek > s.deltaPerWeek : deltaPerWeek >= s.deltaPerWeek
}

export function passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean {
  return stanceDelta(stance, deltaPerWeek) && ratio >= STANCES[stance].ratio
}

/** Spec §3.3: why the other manager would take it; null when they would not. */
export function acceptanceOf(
  theirDelta: number,
  theirRatio: number,
  theirDeltaPerWeek: number
): TradeSuggestion['acceptance'] | null {
  const lineup = theirDelta > 0
  const market = theirRatio >= MARKET_FAIR && theirDeltaPerWeek >= -ACCEPT_LOSS_PER_WEEK
  if (lineup && market) return 'both'
  if (lineup) return 'lineup'
  return market ? 'market' : null
}

/**
 * What `consider` did with a candidate: the suggestion when it passed everything, the evaluation
 * whenever one was run (the bigger shapes bound themselves on the 1-for-1 ones), and their market
 * ratio, which costs nothing.
 */
interface Considered {
  suggestion?: TradeSuggestion
  evaluation?: TradeEvaluation
  theirMarket: number
}

export interface SuggestOptions {
  /** Tests only: result cap (default `SUGGEST_MAX`). */
  max?: number
  /** Tests only: `false` evaluates every candidate instead of skipping the provably rejected ones. */
  prune?: boolean
  /** Tests only: `false` makes every evaluation solve every week (`EvaluateOptions.skip`). */
  skip?: boolean
}

function pairs<T>(list: T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

const ids = (list: PlayerSeries[]): string[] => list.map((s) => s.base.playerId)
const key = (give: string, get: string): string => `${give}|${get}`

/** Descending comparator that is safe on ±∞ (no `b - a` NaN). */
function desc(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1
}

/** Whether `s` could raise that team's optimal lineup in at least one window week. */
function entersLineup(
  build: LineupBuild,
  s: PlayerSeries,
  weeks: number[],
  teamWeeks: TeamWeek[]
): boolean {
  return weeks.some((w, i) => {
    const c = candidateFor(build, s, w)
    return c !== null && canEnter(c, build.slots, teamWeeks[i].optimal)
  })
}

/** Spec §3.2–3.3: evaluate one candidate; null unless my stance and their acceptance both pass. */
function consider(
  build: LineupBuild,
  partner: Team,
  give: PlayerSeries[],
  get: PlayerSeries[],
  stance: TradeStance,
  entersTheirs: (s: PlayerSeries) => boolean,
  opts: SuggestOptions,
  /** 1-for-1s are evaluated even when they look hopeless: the bigger shapes bound themselves on them. */
  always = false
): Considered {
  // Both market ratios need no lineup solve — the same sums evaluateTrade would compute.
  const marketGive = marketSum(build, give).total
  const marketGet = marketSum(build, get).total
  const theirMarket = marketRatio({ marketGive: marketGet, marketGet: marketGive })
  if (marketRatio({ marketGive, marketGet }) < STANCES[stance].ratio) return { theirMarket }
  if (opts.prune !== false && !always) {
    // They accept on their lineup or on the market. Their market side is these sums swapped; their
    // delta cannot be positive when nothing they receive can enter their lineup in any window week
    // (they only lose players and gain ones that never start), so neither test can pass — no solve.
    if (theirMarket < MARKET_FAIR && !give.some(entersTheirs)) return { theirMarket }
  }
  const evaluation = evaluateTrade(
    build,
    { rosterId: partner.rosterId, give: ids(give), get: ids(get) },
    { skip: opts.skip }
  )
  if (!passesStance(stance, evaluation.me.deltaPerWeek, marketRatio(evaluation.me))) {
    return { evaluation, theirMarket }
  }
  const acceptance = acceptanceOf(
    evaluation.them.delta,
    marketRatio(evaluation.them),
    evaluation.them.deltaPerWeek
  )
  return {
    evaluation,
    theirMarket,
    suggestion: acceptance === null ? undefined : { evaluation, acceptance }
  }
}

/** Spec 6b §3: 1-for-1, 2-for-1 and 1-for-2 offers that pass my stance and their acceptance, ranked. */
export function suggestTrades(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): TradeSuggestion[] {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const myRoster = build.rosters.get(me.rosterId) ?? []
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return []

  const includesFocus = (give: PlayerSeries[]): boolean =>
    focusGive === null || give.some((s) => s.base.playerId === focusGive)
  const giveSingles = myRoster.map((s) => [s]).filter(includesFocus)
  const givePairs = pairs(myRoster).filter(includesFocus)

  // Their pool: players who could raise my current optimal lineup in at least one window week.
  const myWeeks = weeks.map((w) => teamWeek(build, me.rosterId, w))
  const entersMine = (s: PlayerSeries): boolean => entersLineup(build, s, weeks, myWeeks)
  const hasWant = (get: PlayerSeries[]): boolean =>
    want === null || get.some((s) => s.base.position === want)

  /**
   * Every 1-for-1 that was evaluated, by give|get. `mine` / `theirs` are usable as bounds on the
   * bigger shapes only when that side needed no drops: optimal totals are monotone in the roster,
   * so giving a second player can only lower my after-total, and receiving a second player can only
   * lower theirs — but a drop removes a player the bigger shape may keep, which breaks the subset.
   */
  interface Single {
    mine: number
    minePerWeek: number
    theirs: number
    myDrops: number
    theirDrops: number
    passed: boolean
  }
  const singles = new Map<string, Single>()
  const record = (give: string, get: string, ev: TradeEvaluation, passed: boolean): void => {
    singles.set(key(give, get), {
      mine: ev.me.delta,
      minePerWeek: ev.me.deltaPerWeek,
      theirs: ev.them.delta,
      myDrops: ev.me.drops.length,
      theirDrops: ev.them.drops.length,
      passed
    })
  }
  const contained = (keys: string[]): Single[] =>
    keys.flatMap((k) => {
      const hit = singles.get(k)
      return hit ? [hit] : []
    })
  const dominated = (delta: number, keys: string[]): boolean =>
    contained(keys).some((s) => s.passed && delta - s.mine <= DOMINANCE_PTS)

  const found: TradeSuggestion[] = []
  const partners = build.inputs.teams.filter(
    (t) =>
      t.rosterId !== me.rosterId &&
      (query.partnerRosterId === null || t.rosterId === query.partnerRosterId)
  )
  for (const partner of partners) {
    const theirWeeks = weeks.map((w) => teamWeek(build, partner.rosterId, w))
    const entersCache = new Map<string, boolean>()
    const entersTheirs = (s: PlayerSeries): boolean => {
      const hit = entersCache.get(s.base.playerId)
      if (hit !== undefined) return hit
      const enters = entersLineup(build, s, weeks, theirWeeks)
      entersCache.set(s.base.playerId, enters)
      return enters
    }
    const pool = (build.rosters.get(partner.rosterId) ?? []).filter(entersMine)
    const getSingles = pool.map((s) => [s]).filter(hasWant)
    const getPairs = pairs(pool).filter(hasWant)
    for (const give of giveSingles) {
      for (const get of getSingles) {
        const r = consider(build, partner, give, get, query.stance, entersTheirs, opts, true)
        if (r.evaluation) {
          record(
            give[0].base.playerId,
            get[0].base.playerId,
            r.evaluation,
            r.suggestion !== undefined
          )
        }
        if (r.suggestion) found.push(r.suggestion)
      }
    }
    for (const give of givePairs) {
      for (const get of getSingles) {
        const keys = give.map((s) => key(s.base.playerId, get[0].base.playerId))
        // My after-roster is a subset of each contained 1-for-1's, so my delta cannot beat theirs.
        if (
          opts.prune !== false &&
          contained(keys).some((c) => c.myDrops === 0 && !stanceDelta(query.stance, c.minePerWeek))
        ) {
          continue
        }
        const r = consider(build, partner, give, get, query.stance, entersTheirs, opts)
        if (r.suggestion && !dominated(r.suggestion.evaluation.me.delta, keys))
          found.push(r.suggestion)
      }
    }
    for (const give of giveSingles) {
      for (const get of getPairs) {
        const keys = get.map((s) => key(give[0].base.playerId, s.base.playerId))
        const r =
          opts.prune !== false &&
          contained(keys).some((c) => c.theirDrops === 0 && c.theirs <= 0) &&
          marketRatio({
            marketGive: marketSum(build, get).total,
            marketGet: marketSum(build, give).total
          }) < MARKET_FAIR
            ? // Their after-roster is a subset of the contained 1-for-1's, so their delta cannot be
              // positive either, and the market cannot carry it: they would refuse.
              { theirMarket: 0 }
            : consider(build, partner, give, get, query.stance, entersTheirs, opts)
        if (r.suggestion && !dominated(r.suggestion.evaluation.me.delta, keys))
          found.push(r.suggestion)
      }
    }
  }
  found.sort(
    (a, b) =>
      desc(a.evaluation.me.delta, b.evaluation.me.delta) ||
      desc(marketRatio(a.evaluation.me), marketRatio(b.evaluation.me)) ||
      a.evaluation.them.name.localeCompare(b.evaluation.them.name)
  )
  return found.slice(0, opts.max ?? SUGGEST_MAX)
}
