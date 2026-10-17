import type { Position, StatKey } from '../rules'

/** Stats-analysis spec §1: the scoring picker. `league` exists once a league is imported. */
export const SCORINGS = ['ppr', 'half', 'std', 'league'] as const
export type Scoring = (typeof SCORINGS)[number]

/** The part of a league's `Rules` that scores a stat line. */
export interface ScoringRules {
  scoring: Record<StatKey, number>
  positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
}

/** Sleeper's default scoring, which its own `pts_std` / `pts_half_ppr` / `pts_ppr` use. */
const BASE: Record<StatKey, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fum_rec_td: 6,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50_59: 5,
  fgm_60p: 6,
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
  sack: 1,
  int: 2,
  fum_rec: 2,
  ff: 1,
  safe: 2,
  def_td: 6,
  blk_kick: 2,
  def_st_td: 6,
  def_st_ff: 1,
  def_st_fum_rec: 1,
  st_td: 6,
  st_ff: 1,
  st_fum_rec: 1,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4
}

/** The presets of the scoring picker: Sleeper's defaults with 1, ½ and 0 points a reception. */
export const SCORING_PRESETS: Record<Exclude<Scoring, 'league'>, ScoringRules> = {
  ppr: { scoring: { ...BASE, rec: 1 }, positionOverrides: {} },
  half: { scoring: { ...BASE, rec: 0.5 }, positionOverrides: {} },
  std: { scoring: { ...BASE }, positionOverrides: {} }
}

export const SCORING_LABELS: Record<Scoring, string> = {
  league: 'My league',
  ppr: 'PPR',
  half: 'Half PPR',
  std: 'Standard'
}
