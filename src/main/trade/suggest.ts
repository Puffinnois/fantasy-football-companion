import { candidateFor, teamWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeStance, TradeSuggestQuery, TradeSuggestion } from '@shared/types'
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
/** Spec §3.4: a 2-for-1 / 1-for-2 that beats its 1-for-1 by no more than this was padding. */
export const DOMINANCE_PTS = 0.5
export const SUGGEST_MAX = 30

export function passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean {
  const s = STANCES[stance]
  const deltaOk = s.strict ? deltaPerWeek > s.deltaPerWeek : deltaPerWeek >= s.deltaPerWeek
  return deltaOk && ratio >= s.ratio
}

/** Spec §3.3: why the other manager would take it; null when they would not. */
export function acceptanceOf(
  theirDelta: number,
  theirRatio: number
): TradeSuggestion['acceptance'] | null {
  const lineup = theirDelta > 0
  const market = theirRatio >= MARKET_FAIR
  if (lineup && market) return 'both'
  if (lineup) return 'lineup'
  return market ? 'market' : null
}

export interface SuggestOptions {
  /** Tests only: result cap (default `SUGGEST_MAX`). */
  max?: number
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

/** Spec §3.2–3.3: evaluate one candidate; null unless my stance and their acceptance both pass. */
function consider(
  build: LineupBuild,
  partner: Team,
  give: PlayerSeries[],
  get: PlayerSeries[],
  stance: TradeStance
): TradeSuggestion | null {
  // My market ratio needs no lineup solve — the same sums evaluateTrade would compute.
  const cheap = { marketGive: marketSum(build, give).total, marketGet: marketSum(build, get).total }
  if (marketRatio(cheap) < STANCES[stance].ratio) return null
  const evaluation = evaluateTrade(build, {
    rosterId: partner.rosterId,
    give: ids(give),
    get: ids(get)
  })
  if (!passesStance(stance, evaluation.me.deltaPerWeek, marketRatio(evaluation.me))) return null
  const acceptance = acceptanceOf(evaluation.them.delta, marketRatio(evaluation.them))
  return acceptance === null ? null : { evaluation, acceptance }
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
  const entersMine = (s: PlayerSeries): boolean =>
    weeks.some((w, i) => {
      const c = candidateFor(build, s, w)
      return c !== null && canEnter(c, build.slots, myWeeks[i].optimal)
    })
  const hasWant = (get: PlayerSeries[]): boolean =>
    want === null || get.some((s) => s.base.position === want)

  // 1-for-1s that passed, by give|get → my delta; the bigger shapes check against them.
  const passing = new Map<string, number>()
  const dominated = (delta: number, keys: string[]): boolean =>
    keys.some((k) => {
      const single = passing.get(k)
      return single !== undefined && delta - single <= DOMINANCE_PTS
    })

  const found: TradeSuggestion[] = []
  const partners = build.inputs.teams.filter(
    (t) =>
      t.rosterId !== me.rosterId &&
      (query.partnerRosterId === null || t.rosterId === query.partnerRosterId)
  )
  for (const partner of partners) {
    const pool = (build.rosters.get(partner.rosterId) ?? []).filter(entersMine)
    const getSingles = pool.map((s) => [s]).filter(hasWant)
    const getPairs = pairs(pool).filter(hasWant)
    for (const give of giveSingles) {
      for (const get of getSingles) {
        const r = consider(build, partner, give, get, query.stance)
        if (r) {
          passing.set(key(give[0].base.playerId, get[0].base.playerId), r.evaluation.me.delta)
          found.push(r)
        }
      }
    }
    for (const give of givePairs) {
      for (const get of getSingles) {
        const r = consider(build, partner, give, get, query.stance)
        const contained = give.map((s) => key(s.base.playerId, get[0].base.playerId))
        if (r && !dominated(r.evaluation.me.delta, contained)) found.push(r)
      }
    }
    for (const give of giveSingles) {
      for (const get of getPairs) {
        const r = consider(build, partner, give, get, query.stance)
        const contained = get.map((s) => key(give[0].base.playerId, s.base.playerId))
        if (r && !dominated(r.evaluation.me.delta, contained)) found.push(r)
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
