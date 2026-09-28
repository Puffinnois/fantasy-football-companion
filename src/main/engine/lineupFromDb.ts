import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups, type LineupBuild } from '@main/lineup/build'
import { buildValueSeason } from '@main/value/build'

/**
 * The lineup build as the handlers' `cachedLineup` makes it, on the caller's connection: the
 * engine worker opens its own, and rebuilding costs ~30 ms — far less than the searches it feeds.
 */
export function lineupBuildFromDb(db: Db, leagueId: string, season: number): LineupBuild {
  const rules = getRules(db, leagueId)
  return buildLineups({
    value: buildValueSeason(db, leagueId, season),
    teams: listTeams(db, leagueId),
    rosterSlots: rules?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, leagueId),
    matchups: listMatchups(db, leagueId, season),
    starterIndexes: listStarterIndexes(db, leagueId),
    tradeDeadlineWeek: rules?.settings.tradeDeadlineWeek ?? null
  })
}
