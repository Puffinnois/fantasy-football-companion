import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamWeek,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { canEnter } from '@main/trade/enter'
import { isStarter, myTeam, requireWindow } from '@main/trade/evaluate'
import { starterWeeks, tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import type { AddOption, AddRow, TradePlayer } from '@shared/types'
import {
  applyRelease,
  compareReleases,
  releaseCandidates,
  type IrSettings,
  type ReleaseCandidate
} from './release'

/** Slice 6c spec §2.4: an add must be worth at least this much over the window to be listed. */
export const LINEUP_MIN_DELTA = 0.5
/** Spec §2.4 / §3: rows per list. */
export const WAIVER_MAX = 30

export interface SearchOptions {
  /** Tests only: `false` scores every free agent and solves every week of every release. */
  skip?: boolean
}

/** What the search reuses across free agents: my roster, its solved window and the releases. */
export interface WaiverContext {
  build: LineupBuild
  weeks: number[]
  roster: PlayerSeries[]
  /** My optimal lineup per window week, index-aligned with `weeks`. */
  base: TeamWeek[]
  before: number
  releases: ReleaseCandidate[]
  /** Per releasable player: my roster without him, per window week (`base` where he doesn't start). */
  without: Map<string, TeamWeek[]>
  /** My players' window starts, for their `TradePlayer` rows. */
  starts: Map<string, number>
}

/** A free agent with every release option scored, best first. */
export interface ScoredAdd {
  series: PlayerSeries
  options: AddOption[]
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

/**
 * Spec §2.1: the search context for any roster — mine (§2–4) or a trade's after-roster (§7).
 * `base` is the roster's optimal lineup per week of `weeks`; `starts` its players' window starts.
 */
export function searchContext(
  build: LineupBuild,
  weeks: number[],
  roster: PlayerSeries[],
  base: TeamWeek[],
  releases: ReleaseCandidate[],
  starts: Map<string, number>
): WaiverContext {
  const without = new Map<string, TeamWeek[]>()
  for (const r of releases) {
    const leaving = r.series
    if (leaving === null || without.has(leaving.base.playerId)) continue
    const rest = roster.filter((s) => s !== leaving)
    without.set(
      leaving.base.playerId,
      weeks.map((w, i) =>
        isStarter(base[i], leaving.base.playerId) ? rosterWeek(build, rest, w) : base[i]
      )
    )
  }
  return {
    build,
    weeks,
    roster,
    base,
    before: sum(base.map((x) => x.optimalTotal)),
    releases,
    without,
    starts
  }
}

export function waiverContext(build: LineupBuild, ir: IrSettings): WaiverContext {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const roster = build.rosters.get(me.rosterId) ?? []
  return searchContext(
    build,
    weeks,
    roster,
    weeks.map((w) => teamWeek(build, me.rosterId, w)),
    releaseCandidates(build, roster, ir),
    starterWeeks(build, me.rosterId, weeks)
  )
}

/** 6b §2.3: can `add` raise `lineup`'s total in week `w`? Exact when false. */
function enters(ctx: WaiverContext, add: PlayerSeries, lineup: TeamWeek, w: number): boolean {
  const candidate = candidateFor(ctx.build, add, w)
  return candidate !== null && canEnter(candidate, ctx.build.slots, lineup.optimal)
}

/** Spec §2.3 step 1: false only when `add` can't start for me in any window week — then no release makes him worth it. */
export function canHelp(ctx: WaiverContext, add: PlayerSeries): boolean {
  return ctx.weeks.some((w, i) => enters(ctx, add, ctx.base[i], w))
}

/** One release's lineup per context week after adding the free agent. */
export interface ReleaseSolve {
  r: ReleaseCandidate
  after: TeamWeek[]
}

/** The row a release's player shows: his window starts on my roster before the move. */
export function releasePlayer(ctx: WaiverContext, r: ReleaseCandidate): TradePlayer | null {
  return r.series
    ? tradePlayer(ctx.build, r.series, ctx.starts.get(r.series.base.playerId) ?? 0)
    : null
}

/** Spec §2.3 steps 2–3: my lineup in each context week after adding `add` with each release, in `ctx.releases` order. */
export function releaseSolves(
  ctx: WaiverContext,
  add: PlayerSeries,
  opts: SearchOptions = {}
): ReleaseSolve[] {
  const { build, weeks, roster, base } = ctx
  const skip = opts.skip !== false
  const withAdd = [...roster, add]
  // Step 2: the oversized roster; where he can't enter, my lineup is already its optimum.
  const oversized = weeks.map((w, i) =>
    skip && !enters(ctx, add, base[i], w) ? base[i] : rosterWeek(build, withAdd, w)
  )
  // Step 3: an IR move and a drop of the same player leave the same lineup — solve him once.
  const solved = new Map<string, TeamWeek[]>()
  const afterWeeks = (r: ReleaseCandidate): TeamWeek[] => {
    const leaving = r.series
    if (leaving === null) return oversized
    const pid = leaving.base.playerId
    const hit = solved.get(pid)
    if (hit) return hit
    const rest = applyRelease(withAdd, r)
    const without = ctx.without.get(pid) ?? []
    const result = weeks.map((w, i) => {
      if (!skip) return rosterWeek(build, rest, w)
      // A player the oversized optimum doesn't start can leave without changing it.
      if (!isStarter(oversized[i], pid)) return oversized[i]
      // If the add can't enter my lineup without him either, that lineup is the optimum.
      if (!enters(ctx, add, without[i], w)) return without[i]
      return rosterWeek(build, rest, w)
    })
    solved.set(pid, result)
    return result
  }
  return ctx.releases.map((r) => ({ r, after: afterWeeks(r) }))
}

/** Spec §2.3 steps 2–4: every release option for adding `add`, scored, best first. */
export function scoreAdd(
  ctx: WaiverContext,
  add: PlayerSeries,
  opts: SearchOptions = {}
): AddOption[] {
  const { build, weeks, base } = ctx
  const id = add.base.playerId
  const scored = releaseSolves(ctx, add, opts).map(({ r, after }) => {
    const delta = round2(sum(after.map((x) => x.optimalTotal)) - ctx.before) ?? 0
    const option: AddOption = {
      release: r.release,
      releasePlayer: releasePlayer(ctx, r),
      delta,
      deltaPerWeek: round2(delta / weeks.length) ?? 0,
      thisWeekDelta: round2(after[0].optimalTotal - base[0].optimalTotal) ?? 0,
      startWeeks: weeks.filter((_, i) => isStarter(after[i], id))
    }
    return { r, option }
  })
  scored.sort((a, b) => b.option.delta - a.option.delta || compareReleases(build, a.r, b.r))
  return scored.map((x) => x.option)
}

/** Spec §2: the value pool's players on no roster. */
export function freeAgents(build: LineupBuild): PlayerSeries[] {
  return [...build.inputs.value.series.values()].filter((s) => s.base.ownerRosterId === null)
}

/** Spec §2.3: every free agent who can start for me in some window week, scored. */
export function scoreFreeAgents(ctx: WaiverContext, opts: SearchOptions = {}): ScoredAdd[] {
  const out: ScoredAdd[] = []
  for (const series of freeAgents(ctx.build)) {
    if (opts.skip !== false && !canHelp(ctx, series)) continue
    out.push({ series, options: scoreAdd(ctx, series, opts) })
  }
  return out
}

function byBest(a: ScoredAdd, b: ScoredAdd): number {
  return (
    b.options[0].delta - a.options[0].delta ||
    b.options[0].thisWeekDelta - a.options[0].thisWeekDelta ||
    a.series.base.fullName.localeCompare(b.series.base.fullName)
  )
}

/** Spec §2.4: adds worth at least `LINEUP_MIN_DELTA` over the window, best first, capped. */
export function lineupRows(ctx: WaiverContext, scored: ScoredAdd[], max = WAIVER_MAX): AddRow[] {
  return scored
    .filter((x) => x.options[0].delta >= LINEUP_MIN_DELTA)
    .sort(byBest)
    .slice(0, max)
    .map((x) => ({ player: tradePlayer(ctx.build, x.series, 0), options: x.options }))
}
