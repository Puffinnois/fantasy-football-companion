import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { upsertPlayers } from '@main/db/repos/players'
import { saveRules } from '@main/db/repos/rules'
import { SETTING_ACTIVE_LEAGUE, SETTING_MY_USER, setSetting } from '@main/db/repos/settings'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { mapLeague, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import type { Rules } from '@shared/rules'
import { rules } from './rules'
import * as fx from './sleeper'

export const SEED_TS = '2026-09-17T12:00:00.000Z'

/**
 * A migrated in-memory DB with league L1 (2 teams, rosters from the Sleeper fixture), every
 * fixture player, and the given rules (default: the 12-team PPR `rules()` fixture) as the active league.
 */
export function seedLeague(leagueRules: Rules = rules()): Db {
  const db = openDatabase(':memory:')
  migrate(db)
  upsertLeague(db, mapLeague(fx.league, SEED_TS), SEED_TS)
  replaceTeams(db, 'L1', mapTeams('L1', fx.rosters, fx.users, 'u1'), SEED_TS)
  replaceRosterPlayers(db, 'L1', mapRosterPlayers(fx.rosters), SEED_TS)
  upsertPlayers(db, mapPlayers(fx.players), SEED_TS)
  saveRules(db, 'L1', leagueRules)
  setSetting(db, SETTING_ACTIVE_LEAGUE, 'L1')
  setSetting(db, SETTING_MY_USER, 'u1')
  return db
}
