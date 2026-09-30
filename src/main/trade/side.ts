import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamName,
  teamWeek,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { swapsBetween } from '@main/lineup/optimal'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type { Swap, Team, TradeIncoming, TradePlayer, TradeSideResult } from '@shared/types'
import { canEnter } from './enter'
import { tradePlayer } from './player'

/** Weekly totals that move by less than this are rounding, not a lineup change. */
const CHANGED_PTS = 0.01

export interface SideOptions {
  /** Tests only: `false` solves every week instead of skipping the provably unchanged ones. */
  skip?: boolean
}

/** Multi-team spec §2.2: one team's part of a deal. */
export interface DealSide {
  team: Team
  give: PlayerSeries[]
  get: PlayerSeries[]
}

/** A side's verdict before its given players carry their destinations — it depends on this side alone. */
export type SideCore = Omit<TradeSideResult, 'give'> & { give: TradePlayer[] }

/** Window starts per roster before the trade (`startsByRoster`). */
export type StartsOf = (rosterId: number) => Map<string, number>

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

export function isStarter(week: TeamWeek, id: string): boolean {
  return week.optimal.some((p) => p.player?.id === id)
}

function startCounts(weeks: TeamWeek[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const week of weeks) {
    for (const placed of week.optimal) {
      if (placed.player) counts.set(placed.player.id, (counts.get(placed.player.id) ?? 0) + 1)
    }
  }
  return counts
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

/** Σ FantasyCalc value of a list; players outside FantasyCalc's list count 0 and are counted. */
export function marketSum(
  build: LineupBuild,
  list: PlayerSeries[]
): { total: number; unvalued: number } {
  let total = 0
  let unvalued = 0
  for (const s of list) {
    const market = build.rowById.get(s.base.playerId)?.market ?? null
    if (market) total += market.value
    else unvalued++
  }
  return { total, unvalued }
}

/** Spec 6b §2.3 week skip: false only when the week's optimal total provably stays the same. */
function mayChange(
  build: LineupBuild,
  before: TeamWeek,
  removed: string[],
  added: PlayerSeries[],
  week: number
): boolean {
  if (removed.some((id) => isStarter(before, id))) return true
  return added.some((s) => {
    const candidate = candidateFor(build, s, week)
    return candidate !== null && canEnter(candidate, build.slots, before.optimal)
  })
}

function toSwaps(after: TeamWeek, before: TeamWeek): Swap[] {
  return swapsBetween(after.optimal, before.optimal).flatMap((pair) => {
    const incoming = after.players.get(pair.in.id)?.player
    if (!incoming) return []
    const outgoing = pair.out ? (before.players.get(pair.out.id)?.player ?? null) : null
    return [{ slot: pair.slot, in: incoming, out: outgoing, delta: pair.delta }]
  })
}

/** The roster a traded player leaves; `resolveDeal` only admits rostered players. */
function ownerOf(s: PlayerSeries): number {
  if (s.base.ownerRosterId === null) throw new Error(`${s.base.playerId} is on no roster`)
  return s.base.ownerRosterId
}

/**
 * Spec 6b §2.3 for one side of any deal: window strength before and after (auto-drops included),
 * market sums, weeks changed, this week's swaps. Received players count their starts on the
 * roster they leave.
 */
function computeSide(
  build: LineupBuild,
  side: DealSide,
  weeks: number[],
  size: number | null,
  startsOf: StartsOf,
  opts: SideOptions
): SideCore {
  const { team, give, get } = side
  const before = weeks.map((w) => teamWeek(build, team.rosterId, w))
  const giveIds = new Set(give.map((s) => s.base.playerId))
  const kept = (build.rosters.get(team.rosterId) ?? []).filter((s) => !giveIds.has(s.base.playerId))
  let after = [...kept, ...get]

  // Spec §2.3: an oversized after-roster drops the players who start least on it, then is solved again.
  let drops: PlayerSeries[] = []
  /** The oversized roster's weeks, kept so a week whose drops never started can reuse the solve. */
  let oversized: TeamWeek[] = []
  const active = after.filter((s) => !onReserve(s))
  const excess = size === null ? 0 : Math.max(0, active.length - size)
  if (excess > 0) {
    // The same week skip as below: where the lineup provably does not move, the before-optimal is
    // an optimum of the oversized roster too, so its starters are the ones to count.
    const givenIds = give.map((s) => s.base.playerId)
    oversized = weeks.map((w, i) =>
      opts.skip !== false && !mayChange(build, before[i], givenIds, get, w)
        ? before[i]
        : rosterWeek(build, after, w)
    )
    const starts = startCounts(oversized)
    const rosPoints = (s: PlayerSeries): number =>
      build.rowById.get(s.base.playerId)?.rosPoints ?? 0
    drops = [...active]
      .sort(
        (a, b) =>
          (starts.get(a.base.playerId) ?? 0) - (starts.get(b.base.playerId) ?? 0) ||
          rosPoints(a) - rosPoints(b) ||
          a.base.fullName.localeCompare(b.base.fullName)
      )
      .slice(0, excess)
    const dropIds = new Set(drops.map((s) => s.base.playerId))
    after = after.filter((s) => !dropIds.has(s.base.playerId))
  }

  const removed = [...give, ...drops].map((s) => s.base.playerId)
  const dropIds = drops.map((s) => s.base.playerId)
  const afterWeeks = weeks.map((w, i) => {
    if (opts.skip !== false && !mayChange(build, before[i], removed, get, w)) return before[i]
    // Dropping a player the oversized lineup never started cannot change that week's optimum.
    const solved = oversized[i]
    if (solved && !dropIds.some((id) => isStarter(solved, id))) return solved
    return rosterWeek(build, after, w)
  })
  const beforeTotal = sum(before.map((x) => x.optimalTotal))
  const afterTotal = sum(afterWeeks.map((x) => x.optimalTotal))
  const delta = round2(afterTotal - beforeTotal) ?? 0
  const own = startsOf(team.rosterId)
  const mine = (s: PlayerSeries): TradePlayer =>
    tradePlayer(build, s, own.get(s.base.playerId) ?? 0)
  const incoming = (s: PlayerSeries): TradeIncoming => {
    const from = ownerOf(s)
    return { ...tradePlayer(build, s, startsOf(from).get(s.base.playerId) ?? 0), from }
  }
  const giveMarket = marketSum(build, give)
  const getMarket = marketSum(build, get)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    give: give.map(mine),
    get: get.map(incoming),
    drops: drops.map(mine),
    before: round2(beforeTotal) ?? 0,
    after: round2(afterTotal) ?? 0,
    delta,
    deltaPerWeek: round2(delta / weeks.length) ?? 0,
    thisWeekDelta: round2(afterWeeks[0].optimalTotal - before[0].optimalTotal) ?? 0,
    marketGive: giveMarket.total,
    marketGet: getMarket.total,
    unvaluedGive: giveMarket.unvalued,
    unvaluedGet: getMarket.unvalued,
    weeksChanged: afterWeeks.filter(
      (x, i) => Math.abs(x.optimalTotal - before[i].optimalTotal) >= CHANGED_PTS
    ).length,
    thisWeekSwaps: toSwaps(afterWeeks[0], before[0])
  }
}

/**
 * Multi-team spec §2.3: side verdicts by `sideKey`. Valid within one build and one set of
 * options (one evaluation or one search run). A hit returns the stored result itself, so its
 * nested arrays and player objects (`get`, `drops`, `thisWeekSwaps`) are shared between
 * evaluations and must be treated as read-only.
 */
export type SideMemo = Map<string, SideCore>

/**
 * `rosterId|gives|gets`, ids sorted — within one build and one set of options, a side's verdict
 * depends on nothing else.
 */
export function sideKey(rosterId: number, give: PlayerSeries[], get: PlayerSeries[]): string {
  const ids = (list: PlayerSeries[]): string =>
    list
      .map((s) => s.base.playerId)
      .sort()
      .join('+')
  return `${rosterId}|${ids(give)}|${ids(get)}`
}

/** `computeSide` through the memo when one is given. */
export function sideFor(
  build: LineupBuild,
  side: DealSide,
  weeks: number[],
  size: number | null,
  startsOf: StartsOf,
  opts: SideOptions,
  memo: SideMemo | null = null
): SideCore {
  if (memo === null) return computeSide(build, side, weeks, size, startsOf, opts)
  const key = sideKey(side.team.rosterId, side.give, side.get)
  const hit = memo.get(key)
  if (hit) return hit
  const core = computeSide(build, side, weeks, size, startsOf, opts)
  memo.set(key, core)
  return core
}
