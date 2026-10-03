import { teamWeek, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team } from '@shared/types'
import { entersLineup } from './enter'
import { myTeam, requireWindow, rosterSize } from './evaluate'
import { startsByRoster } from './player'
import { sideFor, type SideCore, type SideMemo, type StartsOf } from './side'

/** Multi-team spec §3: what one search run shares. */
export interface SearchContext {
  build: LineupBuild
  weeks: number[]
  /** Roster spots that count against the league's size; null when unknown (no drops). */
  size: number | null
  startsOf: StartsOf
  /** Spec §2.3: one side memo per run, so a card and the builder show identical numbers. */
  memo: SideMemo
  me: Team
  /** Every team but me, in league order. */
  others: Team[]
  /** Spec §3.1: the team every deal must involve; null = any. */
  mustInclude: number | null
  /** 6b's `entersLineup` against that team's current lineups, cached per team and player. */
  enters(rosterId: number, s: PlayerSeries): boolean
  /** What a team could send on one hop: singles in roster order, then pairs when `pairs` is set. */
  hopsOf(rosterId: number, pairs: boolean): PlayerSeries[][]
}

/** Spec §3.1: a my side — what I give (x), what I get (z) and the team z comes from (C). */
export interface MySide {
  x: PlayerSeries[]
  z: PlayerSeries[]
  c: Team
  /** `x ids|z ids|C` — the my side's identity. */
  key: string
}

/** Every 1- and 2-element subset: singles in list order, then pairs. */
export function subsets<T>(list: T[]): T[][] {
  const out: T[][] = list.map((x) => [x])
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

/** Player ids sorted, `+`-joined. */
export function idsKey(list: PlayerSeries[]): string {
  return list
    .map((s) => s.base.playerId)
    .sort()
    .join('+')
}

export function mySideKey(x: PlayerSeries[], z: PlayerSeries[], c: Team): string {
  return `${idsKey(x)}|${idsKey(z)}|${c.rosterId}`
}

/** Descending comparator that is safe on ±∞ (no `b - a` NaN). */
export function desc(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1
}

/** Code-point order: ids compare as written. */
export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** A side's verdict through this run's memo. */
export function sideOf(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): SideCore {
  return sideFor(ctx.build, { team, give, get }, ctx.weeks, ctx.size, ctx.startsOf, {}, ctx.memo)
}

export function searchContext(build: LineupBuild, mustInclude: number | null): SearchContext {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const lineups = new Map<number, TeamWeek[]>()
  const entered = new Map<string, boolean>()
  const hops = new Map<number, { singles: PlayerSeries[][]; all: PlayerSeries[][] }>()
  return {
    build,
    weeks,
    size: rosterSize(build),
    startsOf: startsByRoster(build, weeks),
    memo: new Map(),
    me,
    others: build.inputs.teams.filter((t) => t.rosterId !== me.rosterId),
    mustInclude,
    enters(rosterId: number, s: PlayerSeries): boolean {
      const key = `${rosterId}|${s.base.playerId}`
      const known = entered.get(key)
      if (known !== undefined) return known
      let lineup = lineups.get(rosterId)
      if (!lineup) {
        lineup = weeks.map((w) => teamWeek(build, rosterId, w))
        lineups.set(rosterId, lineup)
      }
      const enters = entersLineup(build, s, weeks, lineup)
      entered.set(key, enters)
      return enters
    },
    hopsOf(rosterId: number, pairs: boolean): PlayerSeries[][] {
      let known = hops.get(rosterId)
      if (!known) {
        const all = subsets(build.rosters.get(rosterId) ?? [])
        known = { singles: all.filter((h) => h.length === 1), all }
        hops.set(rosterId, known)
      }
      return pairs ? known.all : known.singles
    }
  }
}
