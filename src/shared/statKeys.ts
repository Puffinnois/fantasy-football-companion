import type { StatKey } from './rules'

export type StatCategory =
  'passing' | 'rushing' | 'receiving' | 'misc' | 'bonus' | 'kicking' | 'defense' | 'idp' | 'other'

export interface StatKeyInfo {
  key: StatKey
  label: string
  category: StatCategory
  /** true = computable from nflverse data (Plan C adapters). false = scores 0, listed as "unsupported". */
  supported: boolean
}

export const STAT_CATEGORIES: { id: StatCategory; label: string }[] = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'misc', label: 'Misc offense' },
  { id: 'bonus', label: 'Bonuses' },
  { id: 'kicking', label: 'Kicking' },
  { id: 'defense', label: 'Team defense' },
  { id: 'idp', label: 'IDP' },
  { id: 'other', label: 'Other (unknown to this app)' }
]

function s(key: StatKey, label: string, category: StatCategory, supported = true): StatKeyInfo {
  return { key, label, category, supported }
}

export const STAT_KEYS: StatKeyInfo[] = [
  // passing
  s('pass_yd', 'Passing yards', 'passing'),
  s('pass_td', 'Passing TD', 'passing'),
  s('pass_int', 'Interception thrown', 'passing'),
  s('pass_2pt', 'Passing 2-pt conversion', 'passing'),
  s('pass_att', 'Pass attempt', 'passing'),
  s('pass_cmp', 'Completion', 'passing'),
  s('pass_inc', 'Incompletion', 'passing'),
  s('pass_sack', 'Sacked', 'passing'),
  s('pass_fd', 'Passing first down', 'passing'),
  s('pass_cmp_40p', 'Completion of 40+ yards', 'passing'),
  s('pass_td_40p', 'Passing TD of 40+ yards', 'passing', false),
  s('pass_td_50p', 'Passing TD of 50+ yards', 'passing', false),
  s('pass_int_td', 'Pick-six thrown', 'passing', false),
  // rushing
  s('rush_yd', 'Rushing yards', 'rushing'),
  s('rush_td', 'Rushing TD', 'rushing'),
  s('rush_2pt', 'Rushing 2-pt conversion', 'rushing'),
  s('rush_att', 'Rush attempt', 'rushing'),
  s('rush_fd', 'Rushing first down', 'rushing'),
  s('rush_40p', 'Rush of 40+ yards', 'rushing'),
  s('rush_td_40p', 'Rushing TD of 40+ yards', 'rushing', false),
  s('rush_td_50p', 'Rushing TD of 50+ yards', 'rushing', false),
  // receiving
  s('rec', 'Reception', 'receiving'),
  s('rec_yd', 'Receiving yards', 'receiving'),
  s('rec_td', 'Receiving TD', 'receiving'),
  s('rec_2pt', 'Receiving 2-pt conversion', 'receiving'),
  s('rec_tgt', 'Target', 'receiving'),
  s('rec_fd', 'Receiving first down', 'receiving'),
  s('rec_40p', 'Reception of 40+ yards', 'receiving'),
  s('rec_td_40p', 'Receiving TD of 40+ yards', 'receiving', false),
  s('rec_td_50p', 'Receiving TD of 50+ yards', 'receiving', false),
  s('rec_0_4', 'Reception of 0-4 yards', 'receiving', false),
  s('rec_5_9', 'Reception of 5-9 yards', 'receiving', false),
  s('rec_10_19', 'Reception of 10-19 yards', 'receiving', false),
  s('rec_20_29', 'Reception of 20-29 yards', 'receiving', false),
  s('rec_30_39', 'Reception of 30-39 yards', 'receiving', false),
  // misc offense
  s('fum', 'Fumble', 'misc'),
  s('fum_lost', 'Fumble lost', 'misc'),
  s('fum_rec', 'Fumble recovery', 'misc'),
  s('fum_rec_td', 'Fumble recovery TD', 'misc'),
  s('st_td', 'Special teams TD', 'misc'),
  s('st_ff', 'Special teams forced fumble', 'misc', false),
  s('st_fum_rec', 'Special teams fumble recovery', 'misc', false),
  s('pr_yd', 'Punt return yards', 'misc'),
  s('kr_yd', 'Kick return yards', 'misc'),
  s('pr_td', 'Punt return TD', 'misc', false),
  s('kr_td', 'Kick return TD', 'misc', false),
  // bonuses (derived in the engine)
  s('bonus_pass_yd_300', '300+ passing yards', 'bonus'),
  s('bonus_pass_yd_400', '400+ passing yards', 'bonus'),
  s('bonus_rush_yd_100', '100+ rushing yards', 'bonus'),
  s('bonus_rush_yd_200', '200+ rushing yards', 'bonus'),
  s('bonus_rec_yd_100', '100+ receiving yards', 'bonus'),
  s('bonus_rec_yd_200', '200+ receiving yards', 'bonus'),
  s('bonus_rush_rec_yd_100', '100+ rushing + receiving yards', 'bonus'),
  s('bonus_rush_rec_yd_200', '200+ rushing + receiving yards', 'bonus'),
  s('bonus_pass_cmp_25', '25+ completions', 'bonus'),
  s('bonus_rush_att_20', '20+ carries', 'bonus'),
  s('bonus_rec_te', 'Per reception (TE)', 'bonus'),
  s('bonus_rec_rb', 'Per reception (RB)', 'bonus'),
  s('bonus_rec_wr', 'Per reception (WR)', 'bonus'),
  // kicking
  s('xpm', 'Extra point made', 'kicking'),
  s('xpmiss', 'Extra point missed', 'kicking'),
  s('fgm', 'Field goal made', 'kicking'),
  s('fgmiss', 'Field goal missed', 'kicking'),
  s('fgm_0_19', 'FG made 0-19', 'kicking'),
  s('fgm_20_29', 'FG made 20-29', 'kicking'),
  s('fgm_30_39', 'FG made 30-39', 'kicking'),
  s('fgm_40_49', 'FG made 40-49', 'kicking'),
  s('fgm_50p', 'FG made 50+', 'kicking'),
  s('fgm_50_59', 'FG made 50-59', 'kicking'),
  s('fgm_60p', 'FG made 60+', 'kicking'),
  s('fgmiss_0_19', 'FG missed 0-19', 'kicking'),
  s('fgmiss_20_29', 'FG missed 20-29', 'kicking'),
  s('fgmiss_30_39', 'FG missed 30-39', 'kicking'),
  s('fgmiss_40_49', 'FG missed 40-49', 'kicking'),
  s('fgmiss_50p', 'FG missed 50+', 'kicking'),
  s('fgm_yds', 'FG yards (made)', 'kicking'),
  s('fgm_yds_over_30', 'FG yards over 30 (made)', 'kicking', false),
  // team defense
  s('sack', 'Sack', 'defense'),
  s('int', 'Interception', 'defense'),
  s('ff', 'Forced fumble', 'defense'),
  s('safe', 'Safety', 'defense'),
  s('blk_kick', 'Blocked kick', 'defense'),
  s('def_td', 'Defensive TD', 'defense'),
  s('def_st_td', 'Special teams TD (DEF)', 'defense'),
  s('def_st_ff', 'Special teams forced fumble (DEF)', 'defense', false),
  s('def_st_fum_rec', 'Special teams fumble recovery (DEF)', 'defense', false),
  s('def_2pt', 'Defensive 2-pt return', 'defense'),
  s('def_pass_def', 'Pass defended', 'defense'),
  s('def_forced_punts', 'Forced punt', 'defense', false),
  s('def_4_and_stop', '4th-down stop', 'defense', false),
  s('def_3_and_out', 'Three-and-out', 'defense', false),
  s('def_kr_yd', 'Kick return yards (DEF)', 'defense', false),
  s('def_pr_yd', 'Punt return yards (DEF)', 'defense', false),
  s('pts_allow', 'Points allowed (per point)', 'defense'),
  s('pts_allow_0', '0 points allowed', 'defense'),
  s('pts_allow_1_6', '1-6 points allowed', 'defense'),
  s('pts_allow_7_13', '7-13 points allowed', 'defense'),
  s('pts_allow_14_20', '14-20 points allowed', 'defense'),
  s('pts_allow_21_27', '21-27 points allowed', 'defense'),
  s('pts_allow_28_34', '28-34 points allowed', 'defense'),
  s('pts_allow_35p', '35+ points allowed', 'defense'),
  s('yds_allow', 'Yards allowed (per yard)', 'defense'),
  s('yds_allow_0_100', '0-99 yards allowed', 'defense'),
  s('yds_allow_100_199', '100-199 yards allowed', 'defense'),
  s('yds_allow_200_299', '200-299 yards allowed', 'defense'),
  s('yds_allow_300_349', '300-349 yards allowed', 'defense'),
  s('yds_allow_350_399', '350-399 yards allowed', 'defense'),
  s('yds_allow_400_449', '400-449 yards allowed', 'defense'),
  s('yds_allow_450_499', '450-499 yards allowed', 'defense'),
  s('yds_allow_500_549', '500-549 yards allowed', 'defense'),
  s('yds_allow_550p', '550+ yards allowed', 'defense'),
  // IDP
  s('idp_tkl', 'Tackle (total)', 'idp'),
  s('idp_tkl_solo', 'Solo tackle', 'idp'),
  s('idp_tkl_ast', 'Assisted tackle', 'idp'),
  s('idp_tkl_loss', 'Tackle for loss', 'idp'),
  s('idp_qb_hit', 'QB hit', 'idp'),
  s('idp_sack', 'Sack (IDP)', 'idp'),
  s('idp_sack_yd', 'Sack yards (IDP)', 'idp'),
  s('idp_int', 'Interception (IDP)', 'idp'),
  s('idp_int_ret_yd', 'Interception return yards (IDP)', 'idp'),
  s('idp_pass_def', 'Pass defended (IDP)', 'idp'),
  s('idp_ff', 'Forced fumble (IDP)', 'idp'),
  s('idp_fum_rec', 'Fumble recovery (IDP)', 'idp'),
  s('idp_fum_ret_yd', 'Fumble return yards (IDP)', 'idp'),
  s('idp_def_td', 'Defensive TD (IDP)', 'idp'),
  s('idp_safe', 'Safety (IDP)', 'idp'),
  s('idp_blk_kick', 'Blocked kick (IDP)', 'idp')
]

export const STAT_KEY_INFO: ReadonlyMap<StatKey, StatKeyInfo> = new Map(
  STAT_KEYS.map((k) => [k.key, k])
)

export function isSupported(key: StatKey): boolean {
  return STAT_KEY_INFO.get(key)?.supported ?? false
}
