/**
 * Play components (stats-analysis spec §5.1): every count, numerator and denominator that comes
 * from a play, written once as an expression over one row of `plays` (alias `p`). The same
 * expressions build `player_week` / `team_week` (summed by week) and answer play-grain queries
 * (summed under a situation filter, spec §7.2), so the two grains cannot disagree.
 */

/** Which source columns an expression reads: FTN is 2022+, participation through the prior season. */
export type PlayGroup = 'pbp' | 'ftn' | 'part'

/**
 * Who a play is credited to.
 * - `passer`: `passer_player_id`, pass attempts and sacks.
 * - `dropback`: nflfastR's `passer_id`, every dropback (scrambles included).
 * - `rusher`, `receiver`: the ball carrier and the targeted receiver.
 * - `onO`, `onD`: every player on the field (participation, through the prior season).
 * - `kicker`, `punter`: the kicking player.
 * - `defender`: the players `play_players` names in a defensive role (`pp.role`).
 */
export type Role =
  'passer' | 'dropback' | 'rusher' | 'receiver' | 'onO' | 'onD' | 'kicker' | 'punter' | 'defender'

export interface PlayComponent {
  name: string
  role: Role
  /** The value one play adds: SQL over `p` (and `pp` for defenders). NULL adds nothing. */
  expr: string
  group: PlayGroup
}

const n = (cond: string): string => `(${cond})::INT`
const when = (cond: string, value: string): string => `CASE WHEN ${cond} THEN ${value} END`
const one = (flag: string): string => `coalesce(p.${flag}, 0) = 1`

const ATTEMPT = `${one('pass_attempt')} AND coalesce(p.sack, 0) = 0`
const PASS_PLAY = `${one('pass_attempt')} OR ${one('sack')}`
const COMPLETE = one('complete_pass')
/** Spec §6.2 thresholds: deep 20+ air yards, explosive runs 10+, breakaway runs 15+. */
const DEEP = 'p.air_yards >= 20'
const RED_ZONE = 'p.yardline_100 <= 20'
const INSIDE_10 = 'p.yardline_100 <= 10'
const INSIDE_5 = 'p.yardline_100 <= 5'
const PRESSURE_KNOWN = 'p.was_pressure IS NOT NULL'
const COVERAGE = "nullif(p.defense_man_zone_type, '')"
const MAN = `${COVERAGE} = 'MAN_COVERAGE'`
const ZONE = `${COVERAGE} = 'ZONE_COVERAGE'`
/** FTN charts every play from 2022; its flags are NULL before. */
const FTN_KNOWN = 'p.is_play_action IS NOT NULL'
const BLITZ = 'p.n_blitzers > 0'
/** Defenders in the box: participation through the prior season, else FTN (2022+). */
export const BOX = 'coalesce(p.defenders_in_box, p.n_defense_box)'
/**
 * Offensive personnel as the usual code ("11" = 1 RB, 1 TE): participation spells it "1 RB, 1 TE,
 * 3 WR" through 2022 and lists the whole line-up from 2023.
 */
export const PERSONNEL = `CASE WHEN nullif(p.offense_personnel, '') IS NOT NULL THEN
    coalesce(nullif(regexp_extract(p.offense_personnel, '(\\d+) RB', 1), ''), '0') ||
    coalesce(nullif(regexp_extract(p.offense_personnel, '(\\d+) TE', 1), ''), '0') END`

function comps(role: Role, group: PlayGroup, defs: Record<string, string>): PlayComponent[] {
  return Object.entries(defs).map(([name, expr]) => ({ name, role, expr, group }))
}

/** Passing, credited to `passer_player_id` on plays that count (attempts and sacks). */
const PASSER: PlayComponent[] = [
  ...comps('passer', 'pbp', {
    pass_att: n(ATTEMPT),
    pass_cmp: n(`${ATTEMPT} AND ${COMPLETE}`),
    pass_yds: when(ATTEMPT, 'coalesce(p.passing_yards, 0)'),
    pass_td: n(`${ATTEMPT} AND ${one('pass_touchdown')}`),
    pass_int: n(`${ATTEMPT} AND ${one('interception')}`),
    sacks_taken: n(one('sack')),
    sack_yds_lost: when(one('sack'), '-p.yards_gained'),
    pass_fd: n(`${ATTEMPT} AND ${one('first_down_pass')}`),
    pass_air_yds: when(ATTEMPT, 'coalesce(p.air_yards, 0)'),
    pass_yac: when(`${ATTEMPT} AND ${COMPLETE}`, 'coalesce(p.yards_after_catch, 0)'),
    pass_plays: n(PASS_PLAY),
    pass_epa: when(PASS_PLAY, 'p.epa'),
    pass_success: when(PASS_PLAY, 'p.success'),
    cpoe_sum: when(ATTEMPT, 'p.cpoe'),
    cpoe_n: n(`${ATTEMPT} AND p.cpoe IS NOT NULL`),
    xcmp_sum: when(`${ATTEMPT} AND p.cpoe IS NOT NULL`, 'p.cp'),
    pass_air_to_sticks: when(`${ATTEMPT} AND p.air_yards IS NOT NULL`, 'p.air_yards - p.ydstogo'),
    pass_air_n: n(`${ATTEMPT} AND p.air_yards IS NOT NULL`),
    deep_att: n(`${ATTEMPT} AND ${DEEP}`),
    deep_epa: when(`${ATTEMPT} AND ${DEEP}`, 'p.epa'),
    pass_wpa: when(PASS_PLAY, 'p.wpa')
  }),
  ...comps('passer', 'ftn', {
    ftn_att: n(`${ATTEMPT} AND ${FTN_KNOWN}`),
    int_worthy: n(`${ATTEMPT} AND p.is_interception_worthy`),
    throwaways: n(`${ATTEMPT} AND p.is_throw_away`)
  })
]

/** Every dropback (nflfastR's `passer_id`), scrambles and sacks included: the QB's EPA. */
const DROPBACK: PlayComponent[] = [
  ...comps('dropback', 'pbp', {
    dropbacks: '1',
    db_epa: 'p.qb_epa',
    db_success: 'p.success',
    scrambles: n(one('qb_scramble')),
    scramble_yds: when(one('qb_scramble'), 'coalesce(p.rushing_yards, 0)')
  }),
  ...comps('dropback', 'part', {
    db_pressure_known: n(PRESSURE_KNOWN),
    db_pressured: n('p.was_pressure'),
    db_pressured_epa: when('p.was_pressure', 'p.qb_epa'),
    db_pressured_sacks: n(`p.was_pressure AND ${one('sack')}`),
    db_clean_epa: when('NOT p.was_pressure', 'p.qb_epa')
  }),
  ...comps('dropback', 'ftn', {
    db_ftn: n(FTN_KNOWN),
    db_blitzed: n(BLITZ),
    db_blitz_epa: when(BLITZ, 'p.qb_epa'),
    db_play_action: n('p.is_play_action'),
    db_pa_epa: when('p.is_play_action', 'p.qb_epa'),
    db_out_of_pocket: n('p.is_qb_out_of_pocket')
  })
]

/** Rushing, credited to the ball carrier on counted carries (scrambles and kneels included). */
const RUSHER: PlayComponent[] = [
  ...comps('rusher', 'pbp', {
    carries: '1',
    rush_yds: 'coalesce(p.rushing_yards, 0)',
    rush_td: n(one('rush_touchdown')),
    rush_fd: n(one('first_down_rush')),
    rush_epa: 'p.epa',
    rush_success: 'p.success',
    rush_10p: n('p.rushing_yards >= 10'),
    rush_15p_yds: when('p.rushing_yards >= 15', 'p.rushing_yards'),
    rush_stuffed: n('p.rushing_yards <= 0'),
    designed_runs: n(`NOT ${one('qb_scramble')} AND NOT ${one('qb_kneel')}`),
    rz_carries: n(RED_ZONE),
    i10_carries: n(INSIDE_10),
    i5_carries: n(INSIDE_5)
  }),
  ...comps('rusher', 'part', {
    box_known: n(`${BOX} IS NOT NULL`),
    box8_carries: n(`${BOX} >= 8`)
  })
]

/** Receiving, credited to the targeted receiver on counted targets. */
const RECEIVER: PlayComponent[] = [
  ...comps('receiver', 'pbp', {
    targets: '1',
    receptions: n(COMPLETE),
    rec_yds: 'coalesce(p.receiving_yards, 0)',
    rec_td: n(one('pass_touchdown')),
    rec_fd: n(`${COMPLETE} AND ${one('first_down_pass')}`),
    rec_air_yds: 'coalesce(p.air_yards, 0)',
    rec_yac: when(COMPLETE, 'coalesce(p.yards_after_catch, 0)'),
    rec_xyac: when(`${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`, 'p.xyac_mean_yardage'),
    rec_xyac_yac: when(
      `${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`,
      'coalesce(p.yards_after_catch, 0)'
    ),
    rec_xyac_n: n(`${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`),
    rec_epa: 'p.epa',
    rec_success: 'p.success',
    deep_targets: n(DEEP),
    rz_targets: n(RED_ZONE),
    i10_targets: n(INSIDE_10),
    ez_targets: n('p.air_yards >= p.yardline_100')
  }),
  ...comps('receiver', 'ftn', {
    tgt_ftn: n(FTN_KNOWN),
    tgt_catchable: n('p.is_catchable_ball'),
    tgt_contested: n('p.is_contested_ball'),
    contested_catches: n(`p.is_contested_ball AND ${COMPLETE}`),
    drops: n('p.is_drop'),
    created_receptions: n('p.is_created_reception')
  }),
  ...comps('receiver', 'part', {
    tgt_man: n(MAN),
    tgt_zone: n(ZONE),
    rec_yds_man: when(MAN, 'coalesce(p.receiving_yards, 0)'),
    rec_yds_zone: when(ZONE, 'coalesce(p.receiving_yards, 0)')
  })
]

/**
 * On the field (participation lists, through the prior season). A route is a dropback the player
 * was on the field for, on offense: blocking backs and tight ends count too.
 */
const ON_FIELD: PlayComponent[] = [
  ...comps('onO', 'part', {
    routes: n('p.is_dropback'),
    routes_man: n(`p.is_dropback AND ${MAN}`),
    routes_zone: n(`p.is_dropback AND ${ZONE}`),
    on_off_plays: n('p.is_snap AND p.counts'),
    on_off_epa: when('p.is_snap AND p.counts', 'p.epa')
  }),
  ...comps('onD', 'part', {
    def_pass_snaps: n('p.is_dropback'),
    on_def_plays: n('p.is_snap AND p.counts'),
    on_def_epa: when('p.is_snap AND p.counts', 'p.epa')
  })
]

const ROLE = (role: string): string => `pp.role = '${role}'`
const TACKLER = "pp.role IN ('solo_tackle', 'tackle_with_assist')"
/** Individual defense from `play_players` (spec §6.2 Defenders). */
const DEFENDER: PlayComponent[] = comps('defender', 'pbp', {
  tackles_solo: n(ROLE('solo_tackle')),
  tackles_assist: n(ROLE('assist_tackle')),
  tackles_with_assist: n(ROLE('tackle_with_assist')),
  sacks: "CASE pp.role WHEN 'sack' THEN 1.0 WHEN 'half_sack' THEN 0.5 END",
  qb_hits: n(ROLE('qb_hit')),
  pass_defended: n(ROLE('pass_defense')),
  def_ints: n(ROLE('interception')),
  forced_fumbles: n(ROLE('forced_fumble')),
  fumble_recoveries: n(ROLE('fumble_recovery')),
  /** A tackle (solo or shared) on a counted run at or behind the line. */
  def_stuffs: n(
    "pp.role IN ('solo_tackle', 'assist_tackle', 'tackle_with_assist') AND p.is_carry AND p.rushing_yards <= 0"
  ),
  tackle_depth_sum: when(
    `${TACKLER} AND p.counts AND p.yards_gained IS NOT NULL`,
    'p.yards_gained'
  ),
  tackle_depth_n: n(`${TACKLER} AND p.counts AND p.yards_gained IS NOT NULL`)
})

/** Kicking and punting value (the counts come from the box score). */
const KICKING: PlayComponent[] = [
  ...comps('kicker', 'pbp', {
    fg_epa: when(one('field_goal_attempt'), 'p.epa'),
    kickoffs: n(one('kickoff_attempt')),
    kickoff_touchbacks: n(`${one('kickoff_attempt')} AND ${one('touchback')}`)
  }),
  ...comps('punter', 'pbp', {
    punt_epa: when(one('punt_attempt'), 'p.epa'),
    punts_pbp: n(one('punt_attempt'))
  })
]

export const PLAYER_PLAY_COMPONENTS: PlayComponent[] = [
  ...PASSER,
  ...DROPBACK,
  ...RUSHER,
  ...RECEIVER,
  ...ON_FIELD,
  ...DEFENDER,
  ...KICKING
]

const ON_FIELD_FROM = 'on_field f JOIN plays p ON p.game_id = f.game_id AND p.play_id = f.play_id'

/** Plays whose `posteam` is the offense: on kickoffs it is the receiving team. */
const SCRIMMAGE_TEAM = "p.play_type IN ('pass', 'run')"

/**
 * The id a role credits, its team, the rows it reads (spec §4.2 counting flags), and the tables
 * those need. `teamFrom` names the plays whose `team` is the player's own: on kickoffs and punts
 * `posteam` / `defteam` belong to the other side for coverage players and kickers.
 */
export const ROLE_SOURCES: Record<
  Role,
  { id: string; team: string; teamFrom: string; from: string; where: string; tables: string[] }
> = {
  passer: {
    id: 'p.passer_player_id',
    team: 'p.posteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: 'plays p',
    where: `p.counts AND (${PASS_PLAY})`,
    tables: ['src_pbp']
  },
  dropback: {
    id: 'p.passer_id',
    team: 'p.posteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: 'plays p',
    where: 'p.is_dropback',
    tables: ['src_pbp']
  },
  rusher: {
    id: 'p.rusher_player_id',
    team: 'p.posteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: 'plays p',
    where: 'p.is_carry',
    tables: ['src_pbp']
  },
  receiver: {
    id: 'p.receiver_player_id',
    team: 'p.posteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: 'plays p',
    where: 'p.is_target',
    tables: ['src_pbp']
  },
  onO: {
    id: 'f.gsis',
    team: 'p.posteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: ON_FIELD_FROM,
    where: "f.side = 'O'",
    tables: ['src_pbp', 'on_field']
  },
  onD: {
    id: 'f.gsis',
    team: 'p.defteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: ON_FIELD_FROM,
    where: "f.side = 'D'",
    tables: ['src_pbp', 'on_field']
  },
  kicker: {
    id: 'p.kicker_player_id',
    team: 'p.posteam',
    teamFrom: "p.play_type IN ('field_goal', 'extra_point')",
    from: 'plays p',
    where: 'true',
    tables: ['src_pbp']
  },
  punter: {
    id: 'p.punter_player_id',
    team: 'p.posteam',
    teamFrom: "p.play_type = 'punt'",
    from: 'plays p',
    where: 'true',
    tables: ['src_pbp']
  },
  defender: {
    id: 'pp.gsis',
    team: 'p.defteam',
    teamFrom: SCRIMMAGE_TEAM,
    from: 'play_players pp JOIN plays p ON p.game_id = pp.game_id AND p.play_id = pp.play_id',
    where:
      "pp.role IN ('solo_tackle', 'assist_tackle', 'tackle_with_assist', 'sack', 'half_sack', 'qb_hit', 'pass_defense', 'interception', 'forced_fumble', 'fumble_recovery')",
    tables: ['src_pbp', 'play_players']
  }
}

const SCRIMMAGE = "p.counts AND p.play_type IN ('pass', 'run')"
/** Neutral game state: win probability 20–80 %, early downs, not the last two minutes of a half. */
export const NEUTRAL =
  'p.wp BETWEEN 0.2 AND 0.8 AND p.down IN (1, 2) AND p.qtr <= 4 AND p.half_seconds_remaining > 120'
const EARLY_DOWN = 'p.down IN (1, 2)'
const EXPLOSIVE =
  "(p.play_type = 'pass' AND p.yards_gained >= 20) OR (p.play_type = 'run' AND p.yards_gained >= 10)"
const HAVOC = `${one('interception')} OR ${one('fumble_forced')} OR ${one('sack')} OR ${one('tackled_for_loss')} OR p.pass_defense_1_player_id IS NOT NULL`
const DESIGNED_RUN = "p.is_carry AND p.play_type = 'run' AND NOT coalesce(p.qb_scramble, 0) = 1"

export interface TeamPlayComponent {
  name: string
  expr: string
  group: PlayGroup
}

function teamComps(group: PlayGroup, defs: Record<string, string>): TeamPlayComponent[] {
  return Object.entries(defs).map(([name, expr]) => ({ name, expr, group }))
}

/**
 * Team components, one expression per play, summed twice: by `posteam` as `off_<name>` and by
 * `defteam` as `def_<name>` (spec §5.2, the warehouse spec's `off_` / `def_` convention).
 */
export const TEAM_PLAY_COMPONENTS: TeamPlayComponent[] = [
  ...teamComps('pbp', {
    plays: n(SCRIMMAGE),
    epa: when(SCRIMMAGE, 'p.epa'),
    success: when(SCRIMMAGE, 'p.success'),
    dropbacks: n('p.is_dropback'),
    dropback_epa: when('p.is_dropback', 'p.epa'),
    dropback_success: when('p.is_dropback', 'p.success'),
    pass_att: n(`p.counts AND ${ATTEMPT}`),
    pass_yds: when(`p.counts AND ${ATTEMPT}`, 'coalesce(p.passing_yards, 0)'),
    pass_air_yds: when(`p.counts AND ${ATTEMPT}`, 'coalesce(p.air_yards, 0)'),
    targets: n('p.is_target'),
    sacks: n(`p.counts AND ${one('sack')}`),
    carries: n('p.is_carry'),
    rush_yds: when('p.is_carry', 'coalesce(p.rushing_yards, 0)'),
    rush_epa: when('p.is_carry', 'p.epa'),
    rush_success: when('p.is_carry', 'p.success'),
    rush_stuffed: n('p.is_carry AND p.rushing_yards <= 0'),
    /** Line yards (the public Football Outsiders formula): 120 % of losses, 100 % of 0–4, 50 % of 5–10. */
    line_yds: when(
      DESIGNED_RUN,
      'CASE WHEN p.rushing_yards < 0 THEN 1.2 * p.rushing_yards WHEN p.rushing_yards <= 4 THEN p.rushing_yards WHEN p.rushing_yards <= 10 THEN 4 + 0.5 * (p.rushing_yards - 4) ELSE 7 END'
    ),
    designed_runs: n(DESIGNED_RUN),
    explosive: n(`${SCRIMMAGE} AND (${EXPLOSIVE})`),
    havoc: n(`${SCRIMMAGE} AND (${HAVOC})`),
    early_plays: n(`${SCRIMMAGE} AND ${EARLY_DOWN}`),
    early_epa: when(`${SCRIMMAGE} AND ${EARLY_DOWN}`, 'p.epa'),
    third_att: n(`${SCRIMMAGE} AND p.down = 3`),
    third_conv: n(`${SCRIMMAGE} AND p.down = 3 AND ${one('first_down')}`),
    fourth_att: n(`${SCRIMMAGE} AND p.down = 4`),
    fourth_conv: n(`${SCRIMMAGE} AND p.down = 4 AND ${one('first_down')}`),
    rz_targets: n(`p.is_target AND ${RED_ZONE}`),
    rz_carries: n(`p.is_carry AND ${RED_ZONE}`),
    turnovers: n(`p.counts AND (${one('interception')} OR ${one('fumble_lost')})`),
    shotgun: n(`${SCRIMMAGE} AND ${one('shotgun')}`),
    no_huddle: n(`${SCRIMMAGE} AND ${one('no_huddle')}`),
    neutral_plays: n(`${SCRIMMAGE} AND ${NEUTRAL}`),
    neutral_dropbacks: n(`${SCRIMMAGE} AND ${NEUTRAL} AND p.is_dropback`),
    neutral_xpass_n: n(`${SCRIMMAGE} AND ${NEUTRAL} AND p.xpass IS NOT NULL`),
    neutral_pass_oe: when(`${SCRIMMAGE} AND ${NEUTRAL} AND p.xpass IS NOT NULL`, 'p.pass_oe'),
    pass_oe_sum: when(`${SCRIMMAGE} AND p.xpass IS NOT NULL`, 'p.pass_oe'),
    pass_oe_n: n(`${SCRIMMAGE} AND p.xpass IS NOT NULL`)
  }),
  ...teamComps('ftn', {
    ftn_plays: n(`${SCRIMMAGE} AND ${FTN_KNOWN}`),
    ftn_dropbacks: n(`p.is_dropback AND ${FTN_KNOWN}`),
    play_action: n('p.is_dropback AND p.is_play_action'),
    play_action_epa: when('p.is_dropback AND p.is_play_action', 'p.epa'),
    rpo: n(`${SCRIMMAGE} AND p.is_rpo`),
    screens: n('p.is_dropback AND p.is_screen_pass'),
    motion: n(`${SCRIMMAGE} AND p.is_motion`),
    blitzed: n(`p.is_dropback AND ${BLITZ}`),
    pass_rushers_sum: when('p.is_dropback', 'p.n_pass_rushers'),
    pass_rushers_n: n('p.is_dropback AND p.n_pass_rushers IS NOT NULL')
  }),
  ...teamComps('part', {
    pressure_known: n(`p.is_dropback AND ${PRESSURE_KNOWN}`),
    pressured: n('p.is_dropback AND p.was_pressure'),
    coverage_known: n(`p.is_dropback AND ${COVERAGE} IS NOT NULL`),
    man: n(`p.is_dropback AND ${MAN}`),
    man_epa: when(`p.is_dropback AND ${MAN}`, 'p.epa'),
    zone: n(`p.is_dropback AND ${ZONE}`),
    zone_epa: when(`p.is_dropback AND ${ZONE}`, 'p.epa'),
    box_known: n(`p.is_carry AND ${BOX} IS NOT NULL`),
    box_sum: when('p.is_carry', BOX),
    personnel_known: n(`${SCRIMMAGE} AND (${PERSONNEL}) IS NOT NULL`),
    personnel_11: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '11'`),
    personnel_12: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '12'`),
    personnel_21: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '21'`)
  })
]

/** A column whose presence in `plays` tells that a group's source is loaded. */
export const GROUP_PROBE: Record<PlayGroup, string | null> = {
  pbp: null,
  ftn: 'is_play_action',
  part: 'was_pressure'
}
