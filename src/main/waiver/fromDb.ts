import { openDatabase } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { listTrendingAdds, trendingFetchedAt } from '@main/db/repos/trending'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { WaiverAdds } from '@shared/types'
import { waiverAdds } from './adds'

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
