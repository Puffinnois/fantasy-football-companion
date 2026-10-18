/**
 * The model columns the query engine reads (stats-analysis spec §8): sums over a team's (player's)
 * weeks, and states at the end of a week. `build.ts` writes them; `engine/registry.ts` serves them.
 */

const KINDS = ['', '_pass', '_rush']

/** `adj_[recent_]{off,def}[_pass|_rush]_epa`: adjusted EPA per play (spec §8.2). */
export const ADJUSTED_STATES = KINDS.flatMap((kind) =>
  ['', 'recent_'].flatMap((r) => ['off', 'def'].map((side) => `adj_${r}${side}${kind}_epa`))
)

/** A team's state at the end of a week: ratings, schedule strength, the season simulation. */
export const TEAM_STATES = [
  'elo',
  'srs',
  'mov',
  ...ADJUSTED_STATES,
  'sos_elo',
  'sos_adj',
  'sos_left_elo',
  'sos_left_adj',
  'games_left',
  'proj_wins',
  'proj_losses',
  'proj_ties',
  'playoff_pct',
  'division_pct',
  'bye_pct',
  'conference_pct',
  'sb_pct'
] as const

/** Turnover luck components (spec §8.3), summed over the team's games. */
export const TURNOVER_SUMS = [
  'off_fumbles',
  'off_fumbles_lost',
  'def_fumbles',
  'def_fumbles_lost',
  'off_ftn_att',
  'off_ftn_ints',
  'off_xints',
  'def_ftn_ints',
  'def_xints'
] as const

/** Field goals the FG model rated (spec §8.4): attempts, makes and expected makes. */
export const FG_SUMS = ['fg_model_att', 'fg_model_made', 'fg_xmade'] as const

/** Sums over a team's games: Elo and Vegas expected wins, pre-game ratings, kicking, turnovers. */
export const TEAM_MODEL_SUMS = [
  'elo_games',
  'elo_wp',
  'vegas_games',
  'vegas_wp',
  'elo_pre',
  'opp_elo_pre',
  ...FG_SUMS,
  ...TURNOVER_SUMS
] as const

export const PLAYER_MODEL_SUMS = [...FG_SUMS] as const

/** A player's combine profile (spec §8.7): one row per player, the same in every season. */
export const COMBINE = [
  'height',
  'weight',
  'forty',
  'bench',
  'vertical',
  'broad_jump',
  'cone',
  'shuttle'
] as const
export const PLAYER_STATES = [
  ...COMBINE,
  ...COMBINE.map((m) => `${m}_score`),
  'ras',
  'ras_measures',
  'speed_score'
] as const
