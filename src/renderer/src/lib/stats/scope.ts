import { relativeTime } from '@/lib/format'
import type { Scoring } from '@shared/stats/scoring'
import type { StatsQuery, StatsStatus } from '@shared/stats/types'

/** Spec §9.1: the controls every Stats screen shares. */
export interface StatsScope {
  season: number
  seasonType: 'REG' | 'POST' | 'ALL'
  /** Regular-season weeks; null is the whole season (or postseason). */
  weeks: [number, number] | null
  scoring: Scoring
}

/** The warehouse starts in 2019 (spec §4). */
export const FIRST_SEASON = 2019

/** Regular-season weeks: 17 through 2020, 18 since. */
export function regularWeeks(season: number): number {
  return season <= 2020 ? 17 : 18
}

/** The season the data runs through; this calendar year's until the first sync lands. */
export function latestSeason(status: StatsStatus | null, now = new Date()): number {
  return status?.through?.season ?? now.getFullYear()
}

/** Every season with data, newest first. */
export function seasonOptions(status: StatsStatus | null, now = new Date()): number[] {
  const last = latestSeason(status, now)
  return Array.from({ length: last - FIRST_SEASON + 1 }, (_, i) => last - i)
}

/**
 * The last regular-season week with data for `season`: the week the data runs through in its
 * latest season, every week of a sealed one.
 */
export function lastWeek(season: number, status: StatsStatus | null): number {
  const t = status?.through
  if (t && t.season === season && t.seasonType === 'REG') return Math.max(1, t.week)
  return regularWeeks(season)
}

export function defaultScope(status: StatsStatus | null, hasLeague: boolean): StatsScope {
  return {
    season: latestSeason(status),
    seasonType: 'REG',
    weeks: null,
    scoring: hasLeague ? 'league' : 'ppr'
  }
}

/** The weeks a scope covers, clamped to the data. */
export function weeksOf(scope: StatsScope, status: StatsStatus | null): [number, number] {
  const last = lastWeek(scope.season, status)
  const [from, to] = scope.weeks ?? [1, last]
  const a = Math.min(Math.max(1, from), last)
  return [a, Math.min(Math.max(a, to), last)]
}

/** The `scope` part of a query: the season, its type and, in the regular season, the weeks. */
export function queryScope(
  scope: StatsScope,
  status: StatsStatus | null
): Pick<StatsQuery['scope'], 'seasons' | 'seasonType' | 'weeks'> {
  const base = { seasons: [scope.season], seasonType: scope.seasonType }
  if (scope.seasonType !== 'REG' || scope.weeks === null) return base
  return { ...base, weeks: weeksOf(scope, status) }
}

/**
 * Games a row needs on the Stats home (handoff 4d): half the regular-season weeks in range, one in
 * the postseason.
 */
export function minGames(scope: StatsScope, status: StatsStatus | null): number {
  if (scope.seasonType === 'POST') return 1
  const [a, b] = weeksOf(scope, status)
  return Math.max(1, Math.ceil((b - a + 1) / 2))
}

/** "Weeks 1–6", "Week 3", "Postseason", "Season and postseason". */
export function rangeLabel(scope: StatsScope, status: StatsStatus | null): string {
  if (scope.seasonType === 'POST') return 'Postseason'
  if (scope.seasonType === 'ALL') return 'Season and postseason'
  const [a, b] = weeksOf(scope, status)
  return a === b ? `Week ${a}` : `Weeks ${a}–${b}`
}

export const SCORING_LABELS: Record<Scoring, string> = {
  league: 'My league',
  ppr: 'PPR',
  half: 'Half PPR',
  std: 'Standard'
}

/** Spec §5.3: "Data through week 6 · updated 3 h ago", or that a refresh is running. */
export function freshness(status: StatsStatus | null, now = Date.now()): string {
  if (!status) return ''
  if (!status.available) return 'Stats unavailable'
  if (!status.through) return status.busy ? 'Loading the stats…' : 'No stats yet'
  const t = status.through
  const through =
    t.seasonType === 'POST'
      ? `Data through the ${t.season} postseason`
      : `Data through ${t.season} week ${t.week}`
  return status.busy
    ? `${through} · updating…`
    : `${through} · updated ${relativeTime(status.updatedAt, now)}`
}
