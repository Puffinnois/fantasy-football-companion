import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type {
  TradeOpenSpots,
  TradeProposal,
  TradeSuggestion,
  TradeSuggestQuery
} from '@shared/types'
import { tradeOpenSpots } from './openSpot'
import { collectDeals } from './suggest'

/** The trade search on its own connection, for the engine worker (6b spec §6). */
export function suggestFromDb(
  dbPath: string,
  leagueId: string,
  query: TradeSuggestQuery
): TradeSuggestion[] {
  const db = openDatabase(dbPath)
  try {
    return collectDeals(lineupBuildFromDb(db, leagueId, query.season), query).cards
  } finally {
    db.close()
  }
}

/** Slice 6c spec §7: a proposal's open-spot adds on their own connection, for the engine worker. */
export function openSpotFromDb(
  dbPath: string,
  leagueId: string,
  season: number,
  proposal: TradeProposal
): TradeOpenSpots {
  const db = openDatabase(dbPath)
  try {
    return tradeOpenSpots(lineupBuildFromDb(db, leagueId, season), proposal)
  } finally {
    db.close()
  }
}
