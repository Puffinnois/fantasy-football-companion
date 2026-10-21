import type { PlayerLink, StatsOwner, StatsOwnership } from '@shared/stats/types'
import type { Db } from '../connection'

interface OwnerRow {
  gsis_id: string | null
  nflverse_team: string | null
  owner: string
  is_me: number
}

/**
 * Stats-analysis spec §9.2: the league's rosters keyed like the stats rows, players by gsis id
 * (`player_ids`) and team defenses by nflverse code. A player without a gsis id is left out.
 */
export function leagueOwnership(db: Db, leagueId: string): StatsOwnership {
  const rows = db
    .prepare(
      `SELECT i.gsis_id, i.nflverse_team, COALESCE(t.team_name, t.display_name) AS owner, t.is_me
       FROM roster_players rp
       JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
       LEFT JOIN player_ids i ON i.player_id = rp.player_id
       WHERE rp.league_id = ?`
    )
    .all(leagueId) as unknown as OwnerRow[]
  const players: Record<string, StatsOwner> = {}
  const teams: Record<string, StatsOwner> = {}
  for (const r of rows) {
    const owner = { name: r.owner, mine: r.is_me === 1 }
    if (r.nflverse_team) teams[r.nflverse_team] = owner
    else if (r.gsis_id) players[r.gsis_id] = owner
  }
  return { players, teams }
}

/**
 * Stats-analysis spec §9.4: the same player in both products, from the league's id map
 * (`player_ids`). A gsis id two Sleeper ids share opens the rostered one first.
 */
export function playerLink(db: Db, id: { sleeper: string } | { gsis: string }): PlayerLink | null {
  const row = (
    'sleeper' in id
      ? db
          .prepare(
            `SELECT player_id, gsis_id, nflverse_team FROM player_ids
             WHERE player_id = ? AND (gsis_id IS NOT NULL OR nflverse_team IS NOT NULL)`
          )
          .get(id.sleeper)
      : db
          .prepare(
            `SELECT i.player_id, i.gsis_id, i.nflverse_team FROM player_ids i WHERE i.gsis_id = ?
             ORDER BY EXISTS (SELECT 1 FROM roster_players rp WHERE rp.player_id = i.player_id) DESC,
                      i.player_id
             LIMIT 1`
          )
          .get(id.gsis)
  ) as { player_id: string; gsis_id: string | null; nflverse_team: string | null } | undefined
  return row ? { sleeper: row.player_id, gsis: row.gsis_id, team: row.nflverse_team } : null
}
