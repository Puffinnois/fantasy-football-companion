import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { suggestTrades } from './suggest'

/** The trade search on its own connection, for the engine worker (6b spec §6). */
export function suggestFromDb(
  dbPath: string,
  leagueId: string,
  query: TradeSuggestQuery
): TradeSuggestion[] {
  const db = openDatabase(dbPath)
  try {
    return suggestTrades(lineupBuildFromDb(db, leagueId, query.season), query)
  } finally {
    db.close()
  }
}
