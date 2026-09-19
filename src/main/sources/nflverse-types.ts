/** One row of `stats_player_week_{season}.csv`. Keyed by GSIS id. */
export interface PlayerWeekStatsRecord {
  gsisId: string
  season: number
  week: number
  /** `REG` | `POST` */
  seasonType: string
  playerName: string | null
  position: string | null
  team: string | null
  opponent: string | null
  /** Every numeric column keyed by its nflverse name; NA / empty / list columns are absent. */
  stats: Record<string, number>
}

/** One row of `stats_team_week_{season}.csv`: the team's own offense and its own defense. */
export interface TeamWeekStatsRecord {
  team: string
  season: number
  week: number
  seasonType: string
  opponent: string | null
  stats: Record<string, number>
}

/** One row of `snap_counts_{season}.csv`. Keyed by PFR id; percentages are 0–1 fractions. */
export interface SnapCountRecord {
  pfrId: string
  season: number
  week: number
  /** `REG` | `WC` | `DIV` | `CON` | `SB` */
  gameType: string
  player: string | null
  position: string | null
  team: string | null
  opponent: string | null
  offenseSnaps: number | null
  offensePct: number | null
  defenseSnaps: number | null
  defensePct: number | null
  stSnaps: number | null
  stPct: number | null
}

/** One row of `schedules/games.csv`. Scores are null until the game is played. */
export interface GameRecord {
  gameId: string
  season: number
  week: number
  gameType: string
  gameday: string | null
  /** Kickoff wall clock in Eastern time, "HH:MM"; null when unscheduled. */
  gametime: string | null
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

/** One row of the DynastyProcess `db_playerids.csv` crosswalk. `team` is deliberately not read (MFL codes). */
export interface CrosswalkRecord {
  sleeperId: string | null
  fantasyprosId: string | null
  gsisId: string | null
  pfrId: string | null
  sportradarId: string | null
  espnId: string | null
  name: string | null
  position: string | null
}
