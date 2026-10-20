import type { StatsOwner, StatsOwnership } from '@shared/stats/types'
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
