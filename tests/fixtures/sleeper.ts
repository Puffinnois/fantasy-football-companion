import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser
} from '@main/sources/sleeper-types'

export const nflState: SleeperNflState = {
  season: '2026',
  week: 2,
  display_week: 1,
  season_type: 'regular',
  league_season: '2026'
}

export const user: SleeperUser = { user_id: 'u1', username: 'me', display_name: 'Me', avatar: null }

export const league: SleeperLeague = {
  league_id: 'L1',
  name: 'Test League',
  season: '2026',
  status: 'in_season',
  total_rosters: 2,
  sport: 'nfl',
  settings: {
    num_teams: 2,
    waiver_type: 2,
    waiver_budget: 100,
    trade_deadline: 13,
    playoff_week_start: 15,
    playoff_teams: 6
  },
  scoring_settings: {
    rec: 1,
    rush_yd: 0.1,
    rec_yd: 0.1,
    rush_td: 6,
    rec_td: 6,
    pass_td: 4,
    pass_yd: 0.04,
    fum_lost: -2
  },
  roster_positions: [
    'QB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'K',
    'DEF',
    'BN',
    'BN',
    'BN',
    'BN',
    'BN',
    'BN',
    'IR'
  ],
  previous_league_id: null
}

export const users: SleeperLeagueUser[] = [
  { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Cook Book' } },
  { user_id: 'u2', display_name: 'Rival', avatar: 'abc', metadata: null }
]

export const rosters: SleeperRoster[] = [
  {
    roster_id: 1,
    owner_id: 'u1',
    league_id: 'L1',
    players: ['4866', '6794', '8259', 'LAR'],
    starters: ['4866', '6794', '0', 'LAR'],
    reserve: ['8259'],
    taxi: null,
    settings: {
      wins: 1,
      losses: 0,
      ties: 0,
      fpts: 131,
      fpts_decimal: 42,
      fpts_against: 98,
      fpts_against_decimal: 6
    }
  },
  {
    roster_id: 2,
    owner_id: 'u2',
    league_id: 'L1',
    players: ['7564', '9509'],
    starters: ['7564'],
    reserve: null,
    taxi: ['9509'],
    settings: {
      wins: 0,
      losses: 1,
      ties: 0,
      fpts: 98,
      fpts_decimal: 6,
      fpts_against: 131,
      fpts_against_decimal: 42
    }
  }
]

const base = {
  status: 'Active',
  injury_status: null,
  depth_chart_order: 1,
  sportradar_id: null,
  espn_id: null
}

export const players: Record<string, SleeperPlayer> = {
  '4866': {
    ...base,
    player_id: '4866',
    full_name: 'Saquon Barkley',
    first_name: 'Saquon',
    last_name: 'Barkley',
    position: 'RB',
    fantasy_positions: ['RB'],
    team: 'PHI',
    age: 29,
    years_exp: 8,
    search_rank: 5,
    gsis_id: ' 00-0034844',
    sportradar_id: 'sr-1',
    espn_id: 3929630
  },
  '6794': {
    ...base,
    player_id: '6794',
    full_name: 'Justin Jefferson',
    first_name: 'Justin',
    last_name: 'Jefferson',
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'MIN',
    age: 27,
    years_exp: 6,
    search_rank: 2,
    gsis_id: '00-0036322'
  },
  '8259': {
    ...base,
    player_id: '8259',
    full_name: 'James Cook',
    first_name: 'James',
    last_name: 'Cook',
    position: 'RB',
    fantasy_positions: ['RB'],
    team: 'BUF',
    age: 26,
    years_exp: 4,
    search_rank: 12,
    gsis_id: '00-0037248',
    injury_status: 'Questionable'
  },
  '7564': {
    ...base,
    player_id: '7564',
    full_name: "Ja'Marr Chase",
    first_name: "Ja'Marr",
    last_name: 'Chase',
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'CIN',
    age: 26,
    years_exp: 5,
    search_rank: 1,
    gsis_id: '00-0036900'
  },
  '9509': {
    ...base,
    player_id: '9509',
    full_name: 'Bijan Robinson',
    first_name: 'Bijan',
    last_name: 'Robinson',
    position: 'RB',
    fantasy_positions: ['RB'],
    team: 'ATL',
    age: 24,
    years_exp: 3,
    search_rank: 3,
    gsis_id: '00-0039013'
  },
  LAR: {
    player_id: 'LAR',
    first_name: 'Los Angeles',
    last_name: 'Rams',
    position: 'DEF',
    fantasy_positions: ['DEF'],
    team: 'LAR',
    status: null,
    injury_status: null,
    age: null,
    years_exp: null,
    depth_chart_order: null,
    search_rank: null,
    gsis_id: null,
    sportradar_id: null,
    espn_id: null
  },
  '1234': {
    ...base,
    player_id: '1234',
    full_name: 'Retired Guy',
    first_name: 'Retired',
    last_name: 'Guy',
    position: 'QB',
    fantasy_positions: ['QB'],
    team: null,
    status: 'Inactive',
    age: 38,
    years_exp: 15,
    search_rank: 9999999,
    gsis_id: ''
  }
}
