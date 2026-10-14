import { withTransaction } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { replaceSleeperStats } from '@main/db/repos/sleeperStats'
import { getNflState } from '@main/db/repos/state'
import type { Rules } from '@shared/rules'
import type { NflState, SyncLogEntry, SyncResult } from '@shared/types'
import { mapSleeperStats } from './mappers'
import { nowOf, runStep, SkipStep, type RefreshOptions, type SyncDeps } from './step'

export const SOURCE_SLEEPER_STATS_PREFIX = 'sleeper:stats:'
export const sourceSleeperStats = (season: number, week: number): string =>
  `${SOURCE_SLEEPER_STATS_PREFIX}${season}:${week}`

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Sleeper stats scoring spec §3.3: corrections land during the week after a game. */
export const RECENT_STATS_FRESHNESS_MS = 6 * HOUR
export const SEASON_STATS_FRESHNESS_MS = 7 * DAY
export const PAST_STATS_FRESHNESS_MS = 30 * DAY
export const STATS_UNAVAILABLE = 'stats endpoint unavailable'
const REGULAR_SEASON_WEEKS = 18

const weeks = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)

/**
 * Spec §3.1: the weeks of `season` with games to fetch. A past season: all of them. The current
 * season: weeks 1 through the state week during the regular season (the week in progress included),
 * all of them in the postseason or offseason, none in the preseason.
 */
export function statsWeeks(season: number, state: NflState): number[] {
  const current = Number(state.season)
  if (season < current) return weeks(REGULAR_SEASON_WEEKS)
  if (season > current) return []
  if (state.seasonType === 'regular') {
    return weeks(Math.min(Math.max(state.week, 0), REGULAR_SEASON_WEEKS))
  }
  return state.seasonType === 'pre' ? [] : weeks(REGULAR_SEASON_WEEKS)
}

/** The league scores an IDP key, so Sleeper's DL / LB / DB rows are fetched too. */
export function scoresIdp(rules: Rules | null): boolean {
  if (!rules) return false
  const tables = [rules.scoring, ...Object.values(rules.positionOverrides)]
  return tables.some((t) => Object.entries(t ?? {}).some(([k, p]) => k.startsWith('idp_') && p))
}

/**
 * Spec §3.3: one step per week, prior season then current. Freshness: the state week and the week
 * before it 6 h, older weeks of the current season 7 days, the prior season 30 days. A forced
 * refresh re-runs only the two recent weeks. A gone endpoint stops the loop after one request.
 */
export async function refreshSleeperStats(
  deps: SyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const steps: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  if (!state) return { steps }
  const current = Number(state.season)
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  const idp = scoresIdp(leagueId ? getRules(deps.db, leagueId) : null)
  for (const season of [current - 1, current]) {
    for (const week of statsWeeks(season, state)) {
      const recent = season === current && state.seasonType === 'regular' && week >= state.week - 1
      const freshness = recent
        ? RECENT_STATS_FRESHNESS_MS
        : season === current
          ? SEASON_STATS_FRESHNESS_MS
          : PAST_STATS_FRESHNESS_MS
      const force = (options.force ?? false) && recent
      const entry = await runStep(
        deps,
        sourceSleeperStats(season, week),
        freshness,
        force,
        async () => {
          const rows = await deps.sleeper.getStats(String(season), week, idp)
          if (!Array.isArray(rows)) throw new SkipStep(STATS_UNAVAILABLE)
          const { records, skipped } = mapSleeperStats(rows, season, week)
          const ts = nowOf(deps).toISOString()
          const written = withTransaction(deps.db, () =>
            replaceSleeperStats(deps.db, season, week, records, ts)
          )
          return { rows: written, message: skipped ? `${skipped} rows skipped` : null }
        }
      )
      steps.push(entry)
      if (entry.status === 'skipped' && entry.message === STATS_UNAVAILABLE) return { steps }
    }
  }
  return { steps }
}
