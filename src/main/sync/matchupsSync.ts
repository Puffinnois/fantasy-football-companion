import { withTransaction } from '@main/db/connection'
import {
  matchupsWeekUpdatedAt,
  replaceMatchupsWeek,
  type MatchupRecord
} from '@main/db/repos/matchups'
import { getNflState } from '@main/db/repos/state'
import type { SleeperMatchup } from '@main/sources/sleeper-types'
import { LAST_WEEK } from '@main/value/series'
import type { SyncLogEntry } from '@shared/types'
import { nowOf, runStep, SkipStep, type SyncDeps } from './step'

export const SOURCE_MATCHUPS_PREFIX = 'sleeper:matchups:'
export const sourceMatchups = (season: number): string => `${SOURCE_MATCHUPS_PREFIX}${season}`

/** A finished week (scores in, lineups locked) is re-fetched this rarely; current and future weeks every refresh. */
export const MATCHUPS_PAST_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000

export function mapMatchups(items: SleeperMatchup[]): MatchupRecord[] {
  return items.map((m) => ({
    rosterId: m.roster_id,
    matchupId: m.matchup_id ?? null,
    starters: m.starters ?? [],
    players: m.players ?? [],
    points: m.points ?? 0
  }))
}

/**
 * Spec §3.3: one step for the current season's 18 weeks. Past weeks are skipped while their stored
 * rows are younger than MATCHUPS_PAST_FRESHNESS_MS (unless forced); an empty answer clears the week.
 * Never throws — a failure is one `error` row, and the weeks written before it stay.
 */
export async function refreshMatchups(
  deps: SyncDeps,
  leagueId: string,
  force: boolean
): Promise<SyncLogEntry> {
  const state = getNflState(deps.db)
  const season = Number(state?.season)
  return runStep(deps, sourceMatchups(season), 0, true, async () => {
    if (!state || Number.isNaN(season)) throw new SkipStep('NFL state unknown')
    const currentWeek = Math.min(Math.max(state.week, 1), LAST_WEEK)
    const now = nowOf(deps).getTime()
    let fetched = 0
    const teams = new Set<number>()
    for (let week = 1; week <= LAST_WEEK; week++) {
      if (!force && week < currentWeek) {
        const stored = matchupsWeekUpdatedAt(deps.db, leagueId, season, week)
        if (stored && now - new Date(stored).getTime() < MATCHUPS_PAST_FRESHNESS_MS) continue
      }
      const records = mapMatchups(await deps.sleeper.getMatchups(leagueId, week))
      const ts = nowOf(deps).toISOString()
      withTransaction(deps.db, () =>
        replaceMatchupsWeek(deps.db, leagueId, season, week, records, ts)
      )
      fetched++
      for (const r of records) teams.add(r.rosterId)
    }
    return { rows: fetched, message: `${fetched} weeks fetched, ${teams.size} teams` }
  })
}
