export interface SleeperUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  status: string
  total_rosters: number
  sport: string
  settings: Record<string, number>
  scoring_settings: Record<string, number>
  roster_positions: string[]
  previous_league_id: string | null
}

export interface SleeperLeagueUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: { team_name?: string } | null
}

export interface SleeperRosterSettings {
  wins?: number
  losses?: number
  ties?: number
  fpts?: number
  fpts_decimal?: number
  fpts_against?: number
  fpts_against_decimal?: number
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  league_id: string
  players: string[] | null
  starters: string[] | null
  reserve: string[] | null
  taxi: string[] | null
  settings: SleeperRosterSettings | null
}

export interface SleeperPlayer {
  player_id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  position: string | null
  fantasy_positions: string[] | null
  team: string | null
  status?: string | null
  injury_status?: string | null
  age?: number | null
  years_exp?: number | null
  depth_chart_order?: number | null
  search_rank?: number | null
  gsis_id?: string | null
  sportradar_id?: string | null
  espn_id?: number | string | null
}

export interface SleeperNflState {
  season: string
  week: number
  display_week: number
  season_type: string
  league_season: string
}

/** One item of the unofficial `/projections/nfl/{season}/{week}` endpoint. `stats` uses Sleeper's stat keys. */
export interface SleeperProjection {
  player_id: string
  season: string
  week: number
  season_type: string
  company: string | null
  team: string | null
  opponent: string | null
  stats: Record<string, number> | null
}
