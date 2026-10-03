import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { TradeOpenSpots, TradeProposal } from '@shared/types'
import { tradeOpenSpots } from './openSpot'

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
