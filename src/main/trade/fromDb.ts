import { openDatabase } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups } from '@main/lineup/build'
import { buildValueSeason } from '@main/value/build'
import type { TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { suggestTrades } from './suggest'

/**
 * The search on its own database connection, so it can run in a worker thread (spec §6: a
 * league-wide scan costs seconds and must not block the main process). Rebuilding the lineup
 * build costs ~30 ms — far less than the search it feeds.
 */
export function suggestFromDb(
  dbPath: string,
  leagueId: string,
  query: TradeSuggestQuery
): TradeSuggestion[] {
  const db = openDatabase(dbPath)
  try {
    const rules = getRules(db, leagueId)
    const build = buildLineups({
      value: buildValueSeason(db, leagueId, query.season),
      teams: listTeams(db, leagueId),
      rosterSlots: rules?.rosterSlots ?? [],
      rosterPositions: leagueRosterPositions(db, leagueId),
      matchups: listMatchups(db, leagueId, query.season),
      starterIndexes: listStarterIndexes(db, leagueId),
      tradeDeadlineWeek: rules?.settings.tradeDeadlineWeek ?? null
    })
    return suggestTrades(build, query)
  } finally {
    db.close()
  }
}
