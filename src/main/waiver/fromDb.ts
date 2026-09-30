import { openDatabase } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { listRegularSeasonGames } from '@main/db/repos/stats'
import { listTrendingAdds, trendingFetchedAt } from '@main/db/repos/trending'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { StreamRow, WaiverAdds } from '@shared/types'
import { waiverAdds } from './adds'
import { waiverStream, weekOpponents } from './stream'

/** Slice 6c spec §6: the rest-of-season lists on their own connection, for the engine worker. */
export function waiverAddsFromDb(dbPath: string, leagueId: string, season: number): WaiverAdds {
  const db = openDatabase(dbPath)
  try {
    const settings = getRules(db, leagueId)?.settings ?? { waiverType: 'priority' as const }
    return waiverAdds(lineupBuildFromDb(db, leagueId, season), {
      settings,
      trending: listTrendingAdds(db),
      trendingFetchedAt: trendingFetchedAt(db)
    })
  } finally {
    db.close()
  }
}

/** Spec §4 / §6: one streaming week on its own connection, for the engine worker. */
export function waiverStreamFromDb(
  dbPath: string,
  leagueId: string,
  season: number,
  week: number
): StreamRow[] {
  const db = openDatabase(dbPath)
  try {
    return waiverStream(lineupBuildFromDb(db, leagueId, season), week, {
      settings: getRules(db, leagueId)?.settings ?? {},
      opponents: weekOpponents(listRegularSeasonGames(db, season), week)
    })
  } finally {
    db.close()
  }
}
