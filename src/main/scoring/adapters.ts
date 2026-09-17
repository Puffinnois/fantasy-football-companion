import type { StatKey } from '@shared/rules'
import type { StatLine } from './engine'

type Stats = Record<string, number>

function sum(stats: Stats, cols: string[]): number {
  return cols.reduce((total, col) => total + (stats[col] ?? 0), 0)
}

/**
 * nflverse `stats_player_week` columns → Sleeper stat keys. A key is emitted when any of its
 * source columns is present; multi-column keys are sums (see plan decision 5 for the choices).
 * `pass_inc` is `attempts − completions` and handled in `playerStatLine`.
 */
export const PLAYER_STAT_MAP: Record<StatKey, string[]> = {
  // passing
  pass_yd: ['passing_yards'],
  pass_td: ['passing_tds'],
  pass_int: ['passing_interceptions'],
  pass_2pt: ['passing_2pt_conversions'],
  pass_att: ['attempts'],
  pass_cmp: ['completions'],
  pass_sack: ['sacks_suffered'],
  pass_fd: ['passing_first_downs'],
  pass_cmp_40p: ['passing_40'],
  // rushing
  rush_yd: ['rushing_yards'],
  rush_td: ['rushing_tds'],
  rush_2pt: ['rushing_2pt_conversions'],
  rush_att: ['carries'],
  rush_fd: ['rushing_first_downs'],
  rush_40p: ['rushing_40'],
  // receiving
  rec: ['receptions'],
  rec_yd: ['receiving_yards'],
  rec_td: ['receiving_tds'],
  rec_2pt: ['receiving_2pt_conversions'],
  rec_tgt: ['targets'],
  rec_fd: ['receiving_first_downs'],
  rec_40p: ['receiving_40'],
  // misc offense
  fum: ['sack_fumbles', 'rushing_fumbles', 'receiving_fumbles'],
  fum_lost: ['sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost'],
  fum_rec: ['fumble_recovery_opp'], // Sleeper pays nothing for recovering your own fumble
  fum_rec_td: ['fumble_recovery_tds'],
  st_td: ['special_teams_tds'],
  pr_yd: ['punt_return_yards'],
  kr_yd: ['kickoff_return_yards'],
  // kicking (blocked kicks count as misses; distance buckets exclude blocked kicks)
  xpm: ['pat_made'],
  xpmiss: ['pat_missed', 'pat_blocked'],
  fgm: ['fg_made'],
  fgmiss: ['fg_missed', 'fg_blocked'],
  fgm_0_19: ['fg_made_0_19'],
  fgm_20_29: ['fg_made_20_29'],
  fgm_30_39: ['fg_made_30_39'],
  fgm_40_49: ['fg_made_40_49'],
  fgm_50p: ['fg_made_50_59', 'fg_made_60_'],
  fgm_50_59: ['fg_made_50_59'],
  fgm_60p: ['fg_made_60_'],
  fgmiss_0_19: ['fg_missed_0_19'],
  fgmiss_20_29: ['fg_missed_20_29'],
  fgmiss_30_39: ['fg_missed_30_39'],
  fgmiss_40_49: ['fg_missed_40_49'],
  fgmiss_50p: ['fg_missed_50_59', 'fg_missed_60_'],
  fgm_yds: ['fg_made_distance'],
  // IDP
  idp_tkl: ['def_tackles_solo', 'def_tackles_with_assist'],
  idp_tkl_solo: ['def_tackles_solo'],
  idp_tkl_ast: ['def_tackle_assists'],
  idp_tkl_loss: ['def_tackles_for_loss'],
  idp_qb_hit: ['def_qb_hits'],
  idp_sack: ['def_sacks'],
  idp_sack_yd: ['def_sack_yards'],
  idp_int: ['def_interceptions'],
  idp_int_ret_yd: ['def_interception_yards'],
  idp_pass_def: ['def_pass_defended'],
  idp_ff: ['def_fumbles_forced'],
  idp_fum_rec: ['fumble_recovery_opp'],
  idp_fum_ret_yd: ['fumble_recovery_yards_opp'],
  idp_def_td: ['def_tds'],
  idp_safe: ['def_safeties'],
  idp_blk_kick: ['def_punt_blocks', 'def_pat_blocks', 'def_fg_blocks']
}

/** nflverse `stats_team_week` defensive columns → Sleeper team-DEF keys. */
export const TEAM_STAT_MAP: Record<StatKey, string[]> = {
  sack: ['def_sacks'],
  int: ['def_interceptions'],
  ff: ['def_fumbles_forced'],
  fum_rec: ['fumble_recovery_opp'],
  safe: ['def_safeties'],
  blk_kick: ['def_punt_blocks', 'def_pat_blocks', 'def_fg_blocks'],
  def_td: ['def_tds'],
  def_st_td: ['special_teams_tds'],
  def_2pt: ['def_2pt_made'],
  def_pass_def: ['def_pass_defended']
}

function mapColumns(stats: Stats, map: Record<StatKey, string[]>): StatLine {
  const line: StatLine = {}
  for (const [key, cols] of Object.entries(map)) {
    if (cols.some((c) => c in stats)) line[key] = sum(stats, cols)
  }
  return line
}

export function playerStatLine(stats: Stats): StatLine {
  const line = mapColumns(stats, PLAYER_STAT_MAP)
  if ('attempts' in stats || 'completions' in stats) {
    line.pass_inc = sum(stats, ['attempts']) - sum(stats, ['completions'])
  }
  return line
}

export interface TeamContext {
  /** Opponent's score from `games`; null when the game is not in the table yet. */
  pointsAllowed: number | null
  /** Opponent's net offensive yards from its `team_week_stats` row; null when missing. */
  yardsAllowed: number | null
}

export function teamStatLine(stats: Stats, ctx: TeamContext): StatLine {
  const line = mapColumns(stats, TEAM_STAT_MAP)
  if (ctx.pointsAllowed !== null) line.pts_allow = ctx.pointsAllowed
  if (ctx.yardsAllowed !== null) line.yds_allow = ctx.yardsAllowed
  return line
}

/** Net offensive yards as the NFL counts them: rushing + passing − yards lost to sacks. */
export function offensiveYards(stats: Stats): number {
  return sum(stats, ['rushing_yards', 'passing_yards']) - sum(stats, ['sack_yards_lost'])
}
